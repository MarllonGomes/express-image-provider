import { Request, Response, NextFunction } from "express";
import slug from 'slug';
import fs from 'fs';
import { promisify } from "util";
import path from "path";
import sharp from 'sharp';

const existsAsync = promisify(fs.exists);

const AllowedImgTypes = "webp" || "jpg" || "jpeg" || "png" || "gif";
const resizeModes = "cover" || "contain" || "fill";
const resizeModesArray = ["cover", "contain", "fill"];

interface ImgServerConfig {
  imgPath: string;
  cacheDir: string;
  cacheTime: number;
  maxWidth: number;
  maxHeight: number;
  quality: number;
  allowedExts: Array<typeof AllowedImgTypes>;
  defaultExt: typeof AllowedImgTypes;
  return404?: boolean;
  timeout: number;
  defaultImg: string;
  resizeMode: typeof resizeModes;
}

interface ImgRequestQueryOptions {
  width?: number;
  height?: number;
  quality?: number;
  ext?: typeof AllowedImgTypes;
  resizeMode: typeof resizeModes;
}

class ImgServer {

  private config: ImgServerConfig;
  private timeoutFunction: NodeJS.Timeout;
  private cacheName: string;
  private cachePath: string;

  private _fileHeaders = {
    'Cache-Control': '',
    'Expires': ''
  };

  private readonly _defaultConfig: ImgServerConfig = {
    imgPath: __dirname + '/uploads',
    cacheDir: __dirname + '/cache',
    cacheTime: 1000 * 60 * 60 * 24 * 7,
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 80,
    allowedExts: ['webp', 'jpg', 'jpeg', 'png', 'gif'],
    defaultExt: 'webp',
    timeout: 5000,
    defaultImg: 'default.jpg',
    return404: false,
    resizeMode: 'cover'
  };

  private readonly _defaultRequestConfig: ImgRequestQueryOptions = {
    width: this._defaultConfig.maxWidth,
    height: this._defaultConfig.maxHeight,
    quality: this._defaultConfig.quality,
    ext: this._defaultConfig.defaultExt,
    resizeMode: this._defaultConfig.resizeMode,
  };

  public constructor(config: ImgServerConfig) {
    this.init(config);
  }

  public middleware = async (req: Request, res: Response, next: NextFunction) => {

    const options = this.parseOptions(req.query);
    this.cacheName = this.loadCacheName(req.path, options);
    this.cachePath = path.join(this.config.cacheDir, this.cacheName);
    const fileName = path.join(this.config.imgPath, req.path);

    res.sendFile(this.cachePath, { headers: this._fileHeaders }, async (err) => {
      
      if(!err) return;
      
      this.timeoutFunction = setTimeout(() => this.respondWith404(res), this.config.timeout); 

      if(!(await this.archiveExists(fileName))) {
        clearTimeout(this.timeoutFunction);
        return this.respondWith404(res);
      }

      const img = await this.getImg(fileName, options);
      if(!img) {
        clearTimeout(this.timeoutFunction);
        return this.respondWith404(res);
      }
      
      clearTimeout(this.timeoutFunction);
      return res.sendFile(this.cachePath, { headers: this._fileHeaders });
    });
  }

  private async getImg(path: string, options: ImgRequestQueryOptions): Promise<boolean> {
    try {
      await sharp(path)
              .resize(
                {
                  width: options.width,
                  height: options.height,
                  fit: options.resizeMode, 
                  position: 'center',
                  withoutEnlargement: true
                }
              )
              .toFormat(options.ext, { quality: options.quality })
              .toFile(this.cachePath);

      return true;
    } catch(err) {
      console.log(err);
      return false;
    }
  }

  private async init(config: ImgServerConfig) {
    this.config = { ...this._defaultConfig, ...config };
    this.validateWritableDir(config.cacheDir);
    this.validateWritableDir(config.imgPath);
    this.setFileHeaders();
    await this.validateDefaultImgExists(config.defaultImg);    
  }

  private setFileHeaders() {
    this._fileHeaders["Cache-Control"] = `public, max-age=${this.config.cacheTime}`;
    this._fileHeaders["Expires"] = new Date(Date.now() + this.config.cacheTime).toUTCString();
  }

  private validateWritableDir(dir: string) {
    
    if (!fs.existsSync(dir)) {
      throw new Error(`${dir} does not exist`);
    }
    
    if (!fs.statSync(dir).isDirectory()) {
      throw new Error(`${dir} is not a directory`);
    }

    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch(err) {
      throw new Error(`${dir} is not writable`);
    }

  }

  private async validateDefaultImgExists(file: string): Promise<void> {
    if(!this.config.return404 && !(await this.archiveExists(file))) {
      throw new Error(`${file} does not exist`);
    }
  }

  private async archiveExists(path: string): Promise<boolean> {
    return await existsAsync(path);
  }

  private parseOptions(query: any): ImgRequestQueryOptions {
    const options = {...this._defaultRequestConfig};

    options.width = (query.width && Number(query.width) && Number(query.width) < this._defaultConfig.maxWidth) 
                    ? Number(query.width) 
                    : this._defaultConfig.maxWidth;

    options.height = (query.height && Number(query.height) && Number(query.height) < this._defaultConfig.maxHeight)
                    ? Number(query.height)
                    : this._defaultConfig.maxHeight;

    options.quality = (query.quality && Number(query.quality) && Number(query.quality) < 100)
                    ? Number(query.quality)
                    : this._defaultConfig.quality;

    options.ext = (query.ext && this._defaultConfig.allowedExts.includes(query.ext))  
                    ? query.ext 
                    : this._defaultConfig.defaultExt;
    
    options.resizeMode = (query.resizeMode && resizeModesArray.includes(query.resizeMode))
                    ? query.resizeMode
                    : this._defaultConfig.resizeMode;

    return options;
  }

  private loadCacheName(path: string, options: ImgRequestQueryOptions) {
    let cacheName = '';
    const ext = '.' + options.ext;
    let fileName = path.substring(0,path.lastIndexOf('.'));
    Object.keys(options).forEach(key => {
      cacheName += `-${key}-${options[key]}`;
    });
    cacheName += `-${fileName}`;
    return slug(cacheName,{replacement: '-', lower: true, trim: true, symbols: true}) + ext;
  }

  private respondWith404(res: Response) {
    res.removeHeader('Cache-Control');
    res.removeHeader('Expires');

    if(this.config.return404) {
      return res.status(404).send('404');
    }
        
    return res.sendFile(path.normalize(this.config.defaultImg));
  }
}

export default ImgServer;
