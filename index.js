const express = require("express");
require("dotenv").config();
const cors = require("cors");
var jwt = require("jsonwebtoken");
const admin = require("firebase-admin");

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
    //await client.connect();
    //database----------------
    const db = client.db("smart_db");
    //collction----------------
    const productCollection = db.collection("products");
    const bidsCollection = db.collection("bids");
    const userCollection = db.collection("users");
    const downloadCollection = db.collection("downloads");

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
    app.get(
      "/product-by-id/:productId",
      verifyFireBaseToken,
      async (req, res) => {
        const productId = req.params.productId;
        const query = { product: productId };
        const cursor = bidsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      }
    );

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
      /* https://smart-deals-server-10.vercel.app/latest-products?limit=15&skip=2&sort=price_min&price=asc&search=ws */
      try {
        const {
          limit = 0,
          skip = 0,
          sort = "price_min",
          price = "asc",
          search = "",
        } = req.query;
        //console.log(limit, skip, sort, price, search);

        /* sort */
        const sortOption = {};
        sortOption[sort || "price_min"] = price === "asc" ? 1 : -1;

        /* search-1 */
        /* const query = search
          ? { title: { $regex: search, $options: "i" } }
          : {}; */

        /* search-2 */
        let query = {};
        if (search) {
          query.title = { $regex: search, $options: "i" };
        }
        //console.log(query);

        const result = await productCollection
          .find(query)
          .sort(sortOption)
          .limit(Number(limit))
          .skip(Number(skip))
          .project({ _id: 0 })
          .toArray();

        /* total products---------- */
        let count = await productCollection.countDocuments(query);

        res.send({ data: result, total: count });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    //! get product -----------------------
    app.get("/all-products", async (req, res) => {
      //console.log(req.query); //https://smart-deals-server-10.vercel.app//all-products?email=seller15@gmail.com
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

    //! product by email finding ----------------
    app.get("/my-products", verifyFireBaseToken, async (req, res) => {
      const email = req.query.email;
      const result = await productCollection.find({ email: email }).toArray();
      res.send(result);
    });

    //! download product by email -----------
    app.post("/downloads", async (req, res) => {
      const data = req.body;
      const result = await downloadCollection.insertOne(data);

      const filter = { _id: new ObjectId(data._id) };
      const update = {
        $inc: {
          downloads: 1,
        },
      };
      const downloadCounts = await productCollection.updateOne(filter, update);
      res.send({ result, downloadCounts });
    });

    //! get download product by email -----------
    app.get("/get-downloads", async (req, res) => {
      const email = req.query.email;

      const result = await downloadCollection
        .find({
          download_by: email,
        })
        .toArray();
      res.send(result);
    });

    //! downloads details -------------------
    app.get("/downloads-details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await downloadCollection.findOne(query);
      res.send(result);
    });

    //! search products -----------------
    app.get("/search", async (req, res) => {
      const search_text = req.query.search;
      const result = await productCollection
        .find({ title: { $regex: search_text, $options: "i" } })
        .toArray();

      res.send(result);
    });

    //! single product --------------------
    app.get("/single-product/:id", async (req, res) => {
      const { id } = req.params;
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

//! Router Error handler..........
// 404 Not Found
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

//! Server Error handler.................
// Global Error Handler
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

app.listen(port, () => {
  console.log(`Server is running port ${port}`);
});
