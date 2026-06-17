import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
    private s3Client: S3Client;

    constructor() {
        // These will be loaded from .env
        this.s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy',
            },
        });
    }

    async uploadFile(key: string, body: Buffer, contentType: string) {
        const command = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET || 'frigo-lab-results',
            Key: key,
            Body: body,
            ContentType: contentType,
        });
        return this.s3Client.send(command);
    }

    async getPresignedUrl(key: string) {
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET || 'frigo-lab-results',
            Key: key,
        });
        // @ts-ignore
        return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    }
}
