import { RequestHandler } from 'express';
import { v1 as uuidv1 } from 'uuid';
import { S3 } from 'aws-sdk';
import { parse } from 'path';

import { HttpError } from '../models/error/HttpError';

const s3 = new S3({
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  region: process.env.S3_BUCKET_REGION!,
});

export const initiateMultipart: RequestHandler = async (req, res, next) => {
  if (!req.user) return;

  try {
    const { treeId, nodeId, fileName, fileType } = req.query as {
      treeId: string;
      nodeId: string;
      fileName: string;
      fileType: string;
    };

    const { dir } = parse(fileType);

    if (dir !== 'video') {
      throw new HttpError(422, 'Invalid file type');
    }

    const params = {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: `videos/${req.user.id}/${treeId}/${fileName}`,
      ContentType: fileType,
      Metadata: { root: `${treeId === nodeId}` },
    };

    const uploadData = await s3.createMultipartUpload(params).promise();

    res.json({ uploadId: uploadData.UploadId });
  } catch (err) {
    return next(err);
  }
};

export const processMultipart: RequestHandler = async (req, res, next) => {
  if (!req.user) return;

  try {
    const { uploadId, treeId, fileName, partNumber } = req.query as {
      uploadId: string;
      treeId: string;
      fileName: string;
      partNumber: string;
    };

    const params = {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: `videos/${req.user.id}/${treeId}/${fileName}`,
      UploadId: uploadId,
      PartNumber: partNumber,
    };

    const presignedUrl = await s3.getSignedUrlPromise('uploadPart', params);

    res.json({ presignedUrl });
  } catch (err) {
    return next(err);
  }
};

export const completeMultipart: RequestHandler = async (req, res, next) => {
  if (!req.user) return;

  try {
    const { uploadId, treeId, fileName, parts } = req.body.params as {
      uploadId: string;
      treeId: string;
      fileName: string;
      parts: { ETag: string; PartNumber: number }[];
    };

    const params = {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: `videos/${req.user.id}/${treeId}/${fileName}`,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    };

    const result = await s3.completeMultipartUpload(params).promise();

    res.json({ url: result.Key });
  } catch (err) {
    return next(err);
  }
};

export const cancelMultipart: RequestHandler = async (req, res, next) => {
  if (!req.user) return;

  try {
    const { uploadId, treeId, fileName } = req.query as {
      uploadId: string;
      treeId: string;
      fileName: string;
    };

    const params = {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: `videos/${req.user.id}/${treeId}/${fileName}`,
      UploadId: uploadId,
    };

    const data = await s3.abortMultipartUpload(params).promise();

    res.json({ data });
  } catch (err) {
    return next(err);
  }
};

export const uploadThumbnail: RequestHandler = async (req, res, next) => {
  if (!req.user) return;

  try {
    const { thumbnail, fileType } = req.body as {
      thumbnail: { name: string; url: string };
      fileType: string;
    };

    const { dir, name } = parse(fileType);

    if (dir !== 'image') {
      throw new HttpError(422, 'Invalid file type');
    }

    const params = {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: thumbnail.url || `images/${req.user.id}/${uuidv1()}.${name}`,
      ContentType: fileType,
    };

    const presignedUrl = await s3.getSignedUrlPromise('putObject', params);

    res.json({ presignedUrl, key: params.Key });
  } catch (err) {
    return next(err);
  }
};

export const deleteThumbnail: RequestHandler = async (req, res, next) => {
  if (!req.user) return;

  try {
    const { key } = req.query as { key: string };

    const params = {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key,
    };

    await s3.deleteObject(params).promise();

    res.json({ message: 'Thumbnail deleted' });
  } catch (err) {
    return next(err);
  }
};
