const express = require("express");
const { ValidationError } = require("express-json-validator-middleware");

const dotenv = require("dotenv");
dotenv.config();

const app = express();
const requireJsonContentType = require("./middlewares/requireJsonContentType");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(requireJsonContentType);

const productRouter = require("./routes/products");
const orderRouter = require("./routes/orders");
app.use("/", productRouter);
app.use("/", orderRouter);

app.use((err, req, res, next) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Invalid Request Body",
    });
  }

  return res.status(err.status || 500).json({
    timestamp: new Date().toISOString(),
    status: err.status || 500,
    error: err.name || "Server error",
    message: err.message || "Something went wrong",
  });
});

module.exports = app;
