require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.ACCESS_TOKEN_SECRET;
const stripeSecret = process.env.STRIPE_SECRET_KEY;

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
    // Create a single article
    app.post("/articles", async (req, res, next) => {
      const article = req.body;
      article.date = new Date();
      article.status = "pending";
      try {
        const result = await articleCollection.insertOne(article);
        res.status(201).send(result);
      } catch (error) {
        next(error);
      }
    });

    // user related functionalities
    // Create a single user
    app.post("/users", async (req, res, next) => {
      const user = req.body;

      try {
        const existingUser = await userCollection.findOne({
          email: user?.email,
        });

        if (!existingUser) {
          user.role = "unpaid";
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
