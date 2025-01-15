require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.ACCESS_TOKEN_SECRET;
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = require("stripe")(stripeSecret);

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rm6ii.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const uri = `mongodb://localhost:27017`;

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

// JWT verification middleware
const verifyToken = (req, res, next) => {
  const { token } = req.cookies;
  const errMessage = { message: "Unauthorized access" };
  if (!token) return res.status(401).send(errMessage);
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) return res.status(401).send(errMessage);
    req.user = decoded;
    next();
  });
};

// Error-handling middleware
const errorHandler = (err, req, res, next) => {
  // console.error("Error: ", err.stack); // Log error for debugging
  res.status(500).send({
    success: false,
    message: "An internal server error occurred, backend",
    details: err.message,
  });
};

// Initialize MongoDB client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Collections List
    const dataBase = client.db("Pixel_News");
    const userCollection = dataBase.collection("users");
    const articleCollection = dataBase.collection("articles");
    const publisherCollection = dataBase.collection("publishers");

    // Cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    };

    // Routes

    // Create JWT token
    app.post("/jwt", async (req, res, next) => {
      const user = req.body;
      const expiresIn = { expiresIn: "23h" };

      try {
        const token = jwt.sign(user, jwtSecret, expiresIn);
        res
          .cookie("token", token, cookieOptions)
          .send({ success: true, message: "JWT token successfully created" });
      } catch (error) {
        next(error);
      }
    });

    // Delete JWT token (logout)
    app.delete("/logout", (req, res, next) => {
      try {
        res
          .clearCookie("token", cookieOptions)
          .send({ success: true, message: "JWT token successfully deleted" });
      } catch (error) {
        next(error);
      }
    });

    //

    // article related functionalities
    // get articles filtered by status approved
    app.get("/articles/approved", async (req, res, next) => {
      try {
        const articles = await articleCollection
          .find({ status: "approved" })
          .toArray();
        res.send(articles);
      } catch (error) {
        next(error);
      }
    });

    // get articles filtered by isPaid true
    app.get("/articles/premium", verifyToken, async (req, res, next) => {
      try {
        const articles = await articleCollection
          .find({ isPaid: true })
          .toArray();
        res.send(articles);
      } catch (error) {
        next(error);
      }
    });

    // get a single article by _id
    app.get("/articles/:id", verifyToken, async (req, res, next) => {
      const id = req.params.id;
      try {
        const article = await articleCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(article);
      } catch (error) {
        next(error);
      }
    });

    // Create a single article
    app.post("/articles", async (req, res, next) => {
      const article = req.body;
      const id = { _id: new ObjectId(article?.publisher) };
      try {
        const publisher = await publisherCollection.findOne(id, {
          projection: { _id: 0 },
        });
        if (publisher && publisher.name) {
          article.date = new Date();
          article.status = "pending";
          article.publisher = publisher;
          const result = await articleCollection.insertOne(article);
          res.status(201).send(result);
        } else res.status(500).send({ message: "Failed to insert article" });
      } catch (error) {
        next(error);
      }
    });

    // increase viewCount to a single article filtered by _id
    app.patch("/articles/view-count/:id", async (req, res, next) => {
      const id = req.params.id;
      try {
        const result = await articleCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { viewCount: 1 } }
        );
        res.send(result);
      } catch (error) {
        next(error);
      }
    });

    // publisher related functionalities
    // get all publishers
    app.get("/publishers", async (req, res, next) => {
      try {
        const publishers = await publisherCollection.find().toArray();
        res.send(publishers);
      } catch (error) {
        next(error);
      }
    });

    // user related functionalities
    // get a single user's role and lastLoginAt filtered by email
    app.get("/users/role/:email", async (req, res, next) => {
      const email = req.params.email;
      try {
        const user = await userCollection.findOne(
          { email },
          { projection: { isAdmin: 1, isPremium: 1, _id: 0 } }
        );
        res.send(user);
      } catch (error) {
        next(error);
      }
    });

    // Create a single user
    app.post("/users", async (req, res, next) => {
      const user = req.body;

      try {
        const existingUser = await userCollection.findOne({
          email: user?.email,
        });

        if (!existingUser) {
          user.isAdmin = false;
          user.isPremium = false;
          const result = await userCollection.insertOne(user);
          res.status(201).send(result);
        } else {
          res.send({ message: "User already exists" });
        }
      } catch (error) {
        next(error);
      }
    });

    // update user's last login time by patch request
    app.patch("/users/:email", async (req, res, next) => {
      const email = req.params.email;
      const time = req.body;
      try {
        const update = { $set: time };
        const result = await userCollection.updateOne({ email }, update);
        res.send(result);
      } catch (error) {
        next(error);
      }
    });

    // payment related functionalities
    // payment intent
    app.post("/create-payment-intent", async (req, res, next) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.status(200).send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        next(error);
      }
    });

    // // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run();

// Root route
app.get("/", (req, res) => {
  res.status(200).send("Pixel News API is up and running!");
});

// Error-handling middleware
app.use(errorHandler);

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
