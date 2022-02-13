import express from "express";
import ImgServer from "./lib/ImgServer";

const server = new ImgServer({
  imgPath: __dirname + "/uploads",
  cacheDir: __dirname + "/cache",
  cacheTime: 1000 * 60 * 60 * 24 * 7,
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 80,
  allowedExts: ["webp", "jpg", "jpeg", "png", "gif"],
  defaultExt: "webp",
  timeout: 5000,
  defaultImg: __dirname + "/uploads/placeholder-image.png",
  return404: false,
  resizeMode: "cover"
});

const app = express();

app.use("/img", server.middleware);

export default app;
