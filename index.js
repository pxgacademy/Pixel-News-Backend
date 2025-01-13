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

    // jwt functionalities
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    };

    // creating JWT token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const expiresIn = { expiresIn: "23h" };

      try {
        const token = jwt.sign(user, jwtSecret, expiresIn);
        res
          .cookie("token", token, cookieOptions)
          .send({ success: true, message: "jwt token successfully created" });
      } catch (error) {
        res.status(500).send({ error: `An error occurred: ${error.message}` });
      }
    });

    // Deleting JWT token
    app.delete("/logout", (req, res) => {
      try {
        res
          .clearCookie("token", cookieOptions)
          .send({ success: true, message: "jwt token successfully deleted" });
      } catch (error) {
        res.status(500).send({ error: `An error occurred: ${error.message}` });
      }
    });

    //

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

// Error Handling Middleware
app.use((err, req, res, next) => {
  res.status(500).send({
    success: false,
    message: "An internal server error occurred",
    details: err.message,
  });
});

app.get("/", (req, res) => {
  res.status(200).send("Bistro Boss is setting");
});

app.listen(port);
