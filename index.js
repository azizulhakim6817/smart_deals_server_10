const express = require("express");
var jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

//! firebase-admin verify-token--------------
//const serviceAccount = require("./smart-deals-firebase-adminsdk.json");
/* s */
// index.js
const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//! middleware-------------------------------
app.use(cors());
app.use(express.json());

/* const loggerInfo = (req, res, next) => {
  console.log("Loggin information");
  next();
}; */

//! firebase verify token -----------------------------------------
const verifyFireBaseToken = async (req, res, next) => {
  // console.log("In the verify middleware", req.headers);
  //Do not allow to go access---------
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unauthrized access!" });
  }
  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized access!" });
  }
  //*verify id token+> npm i firebase-admin --------------------------
  try {
    const userInfo = await admin.auth().verifyIdToken(token);
    console.log("After token validation", userInfo);
    //*req set = token_email---------------
    req.token_email = userInfo.email;
    next();
  } catch (error) {
    console.log("Invalied token!");
    res.status(401).send({ message: "unauthorized access!" });
  }
};

//!database-----------------------------------
//*console.log(process.env);
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_USERNAME_PASSWORD}@cluster0.aramfem.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    await client.connect();
    //database----------------
    const db = client.db("smart_db");
    //collction----------------
    const productCollection = db.collection("products");
    const bidsCollection = db.collection("bids");
    const userCollection = db.collection("users");

    //! jwt create/generate get-Token by api -post---
    app.post("/getToken", (req, res) => {
      const loggeUserEmail = req.body;
      const token = jwt.sign(loggeUserEmail, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token: token });
    });

    //! jwt-- VerifyToken --------------------
    const verifyJWTToken = (req, res, next) => {
      //console.log("frontend req.headers", req.headers);
      //console.log("verify token");
      const authorization = req.headers.authorization;
      if (!authorization) {
        return res.status(401).send({ message: "unauthorized access!" });
      }
      const token = authorization.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access!" });
      }

      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access!" });
        }
        //console.log(decoded);
        req.token_email = decoded.email;
      });

      next();
    };
    //!* user create -----------
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        res.send({
          message: "User already exist, don't neet to insert again!",
        });
      } else {
        const result = await userCollection.insertOne(newUser);
        res.send(result);
      }
    });

    //! create bids ----------------
    app.post("/bids", async (req, res) => {
      const reqBody = req.body;
      const result = await bidsCollection.insertOne(reqBody);
      res.send(result);
    });

    //! get bids-email-all-data---------------
    app.get("/bids-email-all-data", verifyFireBaseToken, async (req, res) => {
      //console.log("headerss", req.headers);
      const email = req.query.email;
      const query = {};
      if (email) {
        query.buyer_email = email;
        if (email !== req.token_email) {
          return res.status(403).send({ message: "forbidden access!" });
        }
      }
      /*//!*console.log(decoded);
      req.token_email = decoded.email; */
      if (email !== req.token_email) {
        return res.status(403).send({ message: "forbidden access!" });
      }

      const cursor = bidsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    /*  //! get bids-email-all-data---------------
    app.get("/bids-email-all-data", verifyFireBaseToken, async (req, res) => {
      //console.log("headers", req.headers);
      //console.log(req);
      const email = req.query.email;
      const query = {};
      if (email) {
        if (email !== req.token_email) {
          return res.status(403).send({ message: "forbidden access!" });
        }
        query.buyer_email = email;
      }
      const cursor = bidsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    }); */

    //! single bids----------------
    app.get("/single-bids/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.findOne(query);
      res.send(result);
    });

    //! product Id by bids matching -----------
    app.get("/product-by-id/:productId", verifyJWTToken, async (req, res) => {
      const productId = req.params.productId;
      const query = { product: productId };
      const cursor = bidsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    //! update bids ------------------
    app.patch("/update-bids/:id", async (req, res) => {
      const reqBody = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: { buyer_name: reqBody.buyer_name },
      };
      const options = {};
      const result = await bidsCollection.updateOne(query, update, options);
      res.send(result);
    });

    //! bids delete --------------------
    app.delete("/bids-delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.deleteOne(query);
      res.send(result);
    });

    //! get all latest-products ------------
    app.get("/latest-products", async (req, res) => {
      const cursor = productCollection.find().sort({ created_at: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    //! get product -----------------------
    app.get("/all-products", async (req, res) => {
      //console.log(req.query); //http://localhost:5000/all-products?email=seller15@gmail.com
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      /* const projectFields = {
        title: 1,
        image: 1,
        price_min: 1,
        price_max: 1,
        location: 1,
        condition: 1,
        _id: 0,
        seller_name: 1,
        seller_contact: 1,
        email: 1,
      }; */
      const cursor = productCollection.find(query).sort({ price_min: 1 });
      //.limit(20)
      //.skip(1)
      //.project(projectFields);
      const result = await cursor.toArray();
      res.send(result);
    });

    //! single product --------------------
    app.get("/single-product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    //! products create api -----------------
    app.post("/products", verifyFireBaseToken, async (req, res) => {
      const newProduct = {
        ...req.body,
        created_at: new Date(), // ✅ auto timestamp
      };
      const result = await productCollection.insertOne(newProduct);
      res.send(result);
    });

    //! update product ----------------
    app.patch("/update-product/:id", async (req, res) => {
      const reqBody = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      //const update = { $set: reqBody };
      const update = {
        $set: {
          name: reqBody.name,
          price: reqBody.price,
        },
      };
      const options = {};
      const result = await productCollection.updateOne(query, update, options);
      res.send(result);
    });

    //! delete product ----------------
    app.delete("/products-delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.deleteOne(query);
      res.send(result);
    });

    //await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    //await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running port ${port}`);
});
