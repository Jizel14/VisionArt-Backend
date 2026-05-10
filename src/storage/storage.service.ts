import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export type PresignedUpload = {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  expiresInSeconds: number;
};

export type UploadedObject = {
  key: string;
  publicUrl: string;
};

@Injectable()
export class StorageService {
  private s3: S3Client | null = null;

  private getEnvBoolean(name: string, defaultValue: boolean): boolean {
    const raw = process.env[name];
    if (raw == null) return defaultValue;
    return raw.trim().toLowerCase() === 'true';
  }

  private getEnvNumber(name: string, defaultValue: number): number {
    const raw = process.env[name];
    if (raw == null) return defaultValue;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  private getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value || !value.trim()) {
      throw new ServiceUnavailableException(
        `Missing required storage configuration: ${name}`,
      );
    }
    return value.trim();
  }

  private getBucket(): string {
    return (process.env.MINIO_BUCKET ?? 'visionart').trim();
  }

  private getPresignExpirySeconds(): number {
    return this.getEnvNumber('MINIO_PRESIGN_EXPIRES_IN', 900);
  }

  private getPublicBaseUrl(): string {
    const endpoint = process.env.MINIO_ENDPOINT?.trim();
    const base = process.env.MINIO_PUBLIC_BASE_URL?.trim();
    return (base && base.length > 0 ? base : endpoint) ?? '';
  }

  private getS3ClientOrThrow(): S3Client {
    if (this.s3) return this.s3;

    const endpoint = this.getRequiredEnv('MINIO_ENDPOINT');
    const accessKeyId = this.getRequiredEnv('MINIO_ACCESS_KEY');
    const secretAccessKey = this.getRequiredEnv('MINIO_SECRET_KEY');

    const region = (process.env.MINIO_REGION ?? 'us-east-1').trim();
    const forcePathStyle = this.getEnvBoolean('MINIO_FORCE_PATH_STYLE', true);

    this.s3 = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    });

    return this.s3;
  }

  private sanitizePathSegment(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private sanitizePrefix(prefix: string): string {
    const trimmed = prefix.trim().replace(/^\/+|\/+$/g, '');
    const safe = trimmed.replace(/[^a-zA-Z0-9/_-]/g, '');
    const parts = safe
      .split('/')
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p !== '.' && p !== '..')
      .map((p) => this.sanitizePathSegment(p));

    return parts.join('/') || 'uploads';
  }

  private sanitizeFileExt(fileExt?: string): string {
    if (!fileExt) return '';
    const trimmed = fileExt.trim().toLowerCase().replace(/^\./, '');
    return trimmed.replace(/[^a-z0-9]/g, '');
  }

  private joinUrlParts(baseUrl: string, ...parts: string[]): string {
    const normalizedBase = baseUrl.replace(/\/+$/g, '');
    const normalizedParts = parts
      .filter((p) => p && p.trim())
      .map((p) => p.replace(/^\/+|\/+$/g, ''));

    return [normalizedBase, ...normalizedParts].join('/');
  }

  private buildPublicUrl(key: string): string {
    const baseUrl = this.getPublicBaseUrl();
    const bucket = this.getBucket();

    if (!baseUrl) return '';

    return this.joinUrlParts(baseUrl, bucket, key);
  }

  private buildObjectKey(options: {
    prefix: string;
    userId?: string;
    fileExt?: string;
  }): string {
    const prefix = this.sanitizePrefix(options.prefix);
    const safeUserId = options.userId
      ? this.sanitizePathSegment(options.userId)
      : '';
    const date = new Date().toISOString().slice(0, 10);
    const id = randomUUID();
    const ext = this.sanitizeFileExt(options.fileExt);

    const base = safeUserId
      ? `${prefix}/${safeUserId}/${date}/${id}`
      : `${prefix}/${date}/${id}`;

    return ext ? `${base}.${ext}` : base;
  }

  async createPresignedUpload(options: {
    contentType: string;
    prefix?: string;
    fileExt?: string;
    userId?: string;
  }): Promise<PresignedUpload> {
    const s3 = this.getS3ClientOrThrow();
    const bucket = this.getBucket();
    const expiresInSeconds = this.getPresignExpirySeconds();

    const key = this.buildObjectKey({
      prefix: options.prefix ?? 'uploads',
      fileExt: options.fileExt,
      userId: options.userId,
    });

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: options.contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: expiresInSeconds,
    });

    const publicUrl = this.buildPublicUrl(key);

    return {
      key,
      uploadUrl,
      publicUrl,
      expiresInSeconds,
    };
  }

  async uploadPublicBuffer(options: {
    buffer: Buffer;
    contentType: string;
    prefix?: string;
    fileExt?: string;
    userId?: string;
  }): Promise<UploadedObject> {
    const s3 = this.getS3ClientOrThrow();
    const bucket = this.getBucket();

    const key = this.buildObjectKey({
      prefix: options.prefix ?? 'uploads',
      fileExt: options.fileExt,
      userId: options.userId,
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: options.buffer,
        ContentType: options.contentType,
      }),
    );

    const publicUrl = this.buildPublicUrl(key);
    if (!publicUrl) {
      throw new ServiceUnavailableException(
        'Storage public URL is not configured (MINIO_PUBLIC_BASE_URL / MINIO_ENDPOINT).',
      );
    }

    return { key, publicUrl };
  }
}
