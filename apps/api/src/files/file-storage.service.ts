import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { env } from '../env';

export interface StoredObject {
  body: Readable;
  contentType: string;
  contentLength: number | undefined;
  metadata: Record<string, string>;
}

/**
 * S3-абстракция (ADR-0002/0008): весь код работает с этим сервисом, не с SDK.
 * Локально и on-prem — MinIO, в облаке — любое S3-совместимое хранилище.
 */
@Injectable()
export class FileStorageService implements OnModuleDestroy {
  private readonly s3 = new S3Client({
    endpoint: env.s3Endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
  });

  async put(
    key: string,
    body: Buffer,
    contentType: string,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: env.s3Bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      }),
    );
  }

  /** null, если объекта нет. */
  async get(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.s3.send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }));
      return {
        body: result.Body as Readable,
        contentType: result.ContentType ?? 'application/octet-stream',
        contentLength: result.ContentLength,
        metadata: result.Metadata ?? {},
      };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.s3.destroy();
  }
}
