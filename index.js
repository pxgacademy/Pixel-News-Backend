require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.ACCESS_TOKEN_SECRET;
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = require("stripe")(stripeSecret);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rm6ii.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const uri = `mongodb://localhost:27017`;

// Add Helmet middleware for security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://js.stripe.com",
          "https://gc.kis.v2.scr.kaspersky-labs.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://gc.kis.v2.scr.kaspersky-labs.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: [
          "'self'",
          "https://api.stripe.com",
          "wss://gc.kis.v2.scr.kaspersky-labs.com",
        ],
      },
    },
  })
);

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://assignment-12-abd.web.app",
      "https://assignment-12-abd.firebaseapp.com",
    ],
    credentials: true,
  })
);

// JWT verification middleware
const verifyToken = (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .send({ message: "Access denied. No token provided." });
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err)
      return res.status(403).send({ message: "Access denied. Invalid token." });
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
    const subscriptionCollection = dataBase.collection("subscriptions");

    // Routes
    // Create JWT token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, jwtSecret, { expiresIn: "23h" });
      res.send({ token });
    });

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const user = await userCollection.findOne(
        { email },
        { projection: { isAdmin: 1, _id: 0 } }
      );
      const isAdmin = user?.isAdmin;
      if (!isAdmin)
        return res
          .status(403)
          .send({ message: "Access denied. You are not an admin." });
      next();
    };

    // article related functionalities

    // get 6 articles for slider
    app.get("/slider-articles", async (req, res, next) => {
      try {
        const articles = await articleCollection
          .aggregate([
            { $match: { status: "approved" } },
            { $sort: { viewCount: -1 } },
            { $limit: 6 },
            {
              $project: {
                title: 1,
                description: 1,
                viewCount: 1,
                image: 1,
                date: 1,
                isPaid: 1,
                "publisher.name": 1,
              },
            },
          ])
          .toArray();
        res.send(articles);
      } catch (error) {
        next(error);
      }
    });

    // get 6 articles for slider
    app.get("/articles/most-popular", async (req, res, next) => {
      try {
        const articles = await articleCollection
          .aggregate([
            { $match: { status: "approved" } },
            { $sort: { viewCount: -1 } },
            { $skip: 6 },
            { $limit: 5 },
            {
              $project: {
                title: 1,
                description: 1,
                viewCount: 1,
                image: 1,
                date: 1,
                isPaid: 1,
                "publisher.name": 1,
              },
            },
          ])
          .toArray();
        res.send(articles);
      } catch (error) {
        next(error);
      }
    });

    // get all articles with aggregate for getting user's name, email, and image
    app.get("/articles", verifyToken, verifyAdmin, async (req, res, next) => {
      try {
        const skip = parseInt(req.query.skip) || 0;
        const limit = parseInt(req.query.limit) || 10;
        const articles = await articleCollection
          .aggregate([
            {
              $lookup: {
                from: "users",
                localField: "creator",
                foreignField: "email",
                as: "userInfo",
              },
            },
            {
              $unwind: {
                path: "$userInfo",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                title: 1,
                date: 1,
                status: 1,
                isPaid: 1,
                creator: 1,
                publisher: 1,
                "userInfo.name": 1,
                "userInfo.image": 1,
              },
            },
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
          ])
          .toArray();
        res.send(articles);
      } catch (error) {
        next(error);
      }
    });

    // get articles filtered by status approved
    app.get("/articles/approved", async (req, res, next) => {
      try {
        const { tags, publisher, title } = req.query;
        const query = { status: "approved" };

        // Filter by tags
        // if (tags && tags !== "all") query.tags = tags;

        // Use $regex in tags
        if (tags && tags !== "all") {
          query.tags = { $elemMatch: { $regex: tags, $options: "i" } };
        }

        // Filter by publisher
        if (publisher && publisher !== "All Publishers") {
          query["publisher.name"] = publisher;
        }

        // Filter by title
        if (title && title !== "") {
          query.title = { $regex: title, $options: "i" }; // Case-insensitive partial match
        }

        const articles = await articleCollection.find(query).toArray();
        res.send(articles);
      } catch (error) {
        next(error);
      }
    });

    // get articles filtered by isPaid true
    app.get("/articles/premium", verifyToken, async (req, res, next) => {
      try {
        const articles = await articleCollection
          .find({
            $and: [{ isPaid: true }, { status: "approved" }],
          })
          .toArray();
        res.send(articles);
      } catch (error) {
        next(error);
      }
    });

    // get articles filtered by creator email
    app.get("/articles/creator/:email", verifyToken, async (req, res, next) => {
      const email = req.params.email;
      const query = { creator: email };
      try {
        const articles = await articleCollection.find(query).toArray();
        res.send(articles);
      } catch (error) {
        next(error);
      }
    });

    // get a single article by _id
    app.get("/articles/:id", verifyToken, async (req, res, next) => {
      const id = req.params.id;
      try {
        const article = await articleCollection
          .aggregate([
            { $match: { _id: new ObjectId(id) } },
            {
              $lookup: {
                from: "users",
                localField: "creator",
                foreignField: "email",
                as: "userInfo",
              },
            },
            {
              $unwind: {
                path: "$userInfo",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                "userInfo.createdAt": 0,
                "userInfo.lastLoginAt": 0,
                "userInfo.isAdmin": 0,
                "userInfo.isPremium": 0,
                "userInfo.paidDate": 0,
              },
            },
          ])
          .toArray();
        res.send(article?.[0] || article);
      } catch (error) {
        next(error);
      }
    });

    // Create a single article
    app.post("/articles", verifyToken, async (req, res, next) => {
      const article = req.body;
      const id = { _id: new ObjectId(article?.publisher) };
      try {
        const publisher = await publisherCollection.findOne(id);
        if (publisher && publisher.name) {
          article.date = new Date();
          article.status = "pending";
          article.isPaid = false;
          article.viewCount = 0;
          article.publisher = publisher;
          const result = await articleCollection.insertOne(article);
          res.status(201).send(result);
        } else res.status(500).send({ message: "Failed to insert article" });
      } catch (error) {
        next(error);
      }
    });

    // update an article filtered by _id
    app.put("/articles/:id", verifyToken, async (req, res, next) => {
      const article = req.body;
      const id = req.params.id;
      const publisherId = { _id: new ObjectId(article?.publisher) };
      const articleId = { _id: new ObjectId(id) };

      try {
        const publisher = await publisherCollection.findOne(publisherId);
        if (publisher && publisher.name) {
          article.publisher = publisher;
          (article.isPaid = false), (article.status = "pending");
          const result = await articleCollection.updateOne(articleId, {
            $set: article,
          });
          res.send(result);
        } else res.status(500).send({ message: "Failed to update article" });
      } catch (error) {
        next(error);
      }
    });

    // update an article status filtered by _id
    app.patch(
      "/articles/status-update/:id",
      verifyToken,
      verifyAdmin,
      async (req, res, next) => {
        const article = req.body;
        const id = req.params.id;
        const articleId = { _id: new ObjectId(id) };
        try {
          const result = await articleCollection.updateOne(articleId, {
            $set: article,
          });
          res.send(result);
        } catch (error) {
          next(error);
        }
      }
    );

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

    // delete an article filtered by _id
    app.delete("/articles/:id", verifyToken, async (req, res, next) => {
      const id = req.params.id;
      try {
        const result = await articleCollection.deleteOne({
          _id: new ObjectId(id),
        });
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

    // insert a new publisher
    app.post(
      "/publishers",
      verifyToken,
      verifyAdmin,
      async (req, res, next) => {
        const publisher = req.body;
        try {
          const result = await publisherCollection.insertOne(publisher);
          res.status(201).send(result);
        } catch (error) {
          next(error);
        }
      }
    );

    // user related functionalities ==========

    // get total counts of premium and not premium users
    app.get("/users/counts", async (req, res, next) => {
      try {
        const nonPremium = await userCollection.countDocuments({
          isPremium: false,
        });
        const premium = await userCollection.countDocuments({
          isPremium: true,
        });
        res.send({ nonPremium, premium });
      } catch (error) {
        next(error);
      }
    });

    // get all users
    app.get("/users", verifyToken, verifyAdmin, async (req, res, next) => {
      try {
        const skip = parseInt(req.query.skip) || 0;
        const limit = parseInt(req.query.limit) || 10;

        const users = await userCollection
          .find()
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send(users);
      } catch (error) {
        next(error);
      }
    });

    // get a single user by email
    app.get("/users/:email", verifyToken, async (req, res, next) => {
      const email = req.params.email;
      try {
        const user = await userCollection.findOne({ email });
        const articles = await articleCollection.countDocuments({
          creator: email,
        });
        const articlesViews = await articleCollection
          .aggregate([
            { $match: { creator: email } },
            {
              $group: {
                _id: null,
                total: { $sum: "$viewCount" },
              },
            },
            { $project: { _id: 0, total: 1 } },
          ])
          .toArray();
        const subscriptions = await subscriptionCollection
          .aggregate([
            { $match: { email } },
            {
              $group: {
                _id: null,
                payment: { $sum: "$priceAndTime.price" },
              },
            },
            { $project: { _id: 0, payment: 1 } },
          ])
          .toArray();

        const totalViews = articlesViews?.[0] ? articlesViews[0].total : 0;
        const totalPayment = subscriptions?.[0] ? subscriptions[0].payment : 0;

        res.send({ user, articles, totalViews, totalPayment });
      } catch (error) {
        next(error);
      }
    });

    // get a single user's role and lastLoginAt filtered by email
    app.get("/users/role/:email", async (req, res, next) => {
      const email = req.params.email;
      try {
        const user = await userCollection.findOne(
          { email },
          { projection: { isAdmin: 1, isPremium: 1, paidDate: 1, _id: 0 } }
        );
        res.send(user);
      } catch (error) {
        next(error);
      }
    });

    // update a user role isPremium false or isAdmin true filtered by user email
    app.patch(
      "/users/role/update/:email",
      verifyToken,
      async (req, res, next) => {
        const email = req.params.email;
        const role = req.body;
        try {
          const result = await userCollection.updateOne(
            { email },
            { $set: role }
          );
          res.send(result);
        } catch (error) {
          next(error);
        }
      }
    );

    // update user info filtered by _id with patch request
    app.patch("/users/update/:id", verifyToken, async (req, res, next) => {
      const user = req.body;
      const id = req.params.id;
      try {
        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: user }
        );
        res.send(result);
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
    /*
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
    */

    // payment related functionalities
    // payment intent
    app.post("/create-payment-intent", verifyToken, async (req, res, next) => {
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

    // insert a new payment
    app.post("/subscription-histories", verifyToken, async (req, res, next) => {
      const history = req.body;
      history.date = Date.now();
      const time = parseInt(history.priceAndTime.time);
      const timeInMs = time * 60 * 1000;

      try {
        const paymentHistory = await subscriptionCollection.insertOne(history);
        if (paymentHistory?.insertedId) {
          const date = Date.now();
          paidDate = timeInMs + date;

          const updateUser = await userCollection.updateOne(
            { email: history.email },
            { $set: { isPremium: true, paidDate } }
          );
          res.status(201).send({ paymentHistory, updateUser });
        } else {
          res.status(500).send({ message: "Failed to insert payment history" });
        }
      } catch (error) {
        next(error);
      }
    });

    // Dashboard related functionalities

    // admin analytics
    app.get(
      "/admin/analytics",
      verifyToken,
      verifyAdmin,
      async (req, res, next) => {
        try {
          const articles = await articleCollection.estimatedDocumentCount();
          const users = await userCollection.estimatedDocumentCount();
          const nonPremium = await userCollection.countDocuments({
            isPremium: false,
          });
          const premium = await userCollection.countDocuments({
            isPremium: true,
          });
          const publishers = await publisherCollection.estimatedDocumentCount();
          const subscriptions =
            await subscriptionCollection.estimatedDocumentCount();
          const totalPayment = await subscriptionCollection
            .aggregate([
              { $project: { totalPrice: { $sum: "$priceAndTime.price" } } },
            ])
            .toArray();
          const payment = totalPayment?.[0] && totalPayment[0].totalPrice;

          const articlesPerPublisher = await articleCollection
            .aggregate([
              {
                $group: {
                  _id: "$publisher.name",
                  totalArticles: { $sum: 1 },
                  totalViews: { $sum: "$viewCount" },
                },
              },
            ])
            .toArray();

          res.send({
            articles,
            users,
            nonPremium,
            premium,
            publishers,
            subscriptions,
            payment,
            articlesPerPublisher,
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
app.listen(port);
