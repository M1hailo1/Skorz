import 'dotenv/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const client = new S3Client({ forcePathStyle: true });
const bucket = 'assets';

export const storage = {
  async upload(key: string, body: string | Uint8Array, contentType: string) {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: body, ContentType: contentType,
    }));
  },
  async download(key: string) {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) throw new Error('Storage returned an empty response body.');
    return response.Body.transformToByteArray();
  },
  async delete(key: string) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
  close() {
    client.destroy();
  },
};
