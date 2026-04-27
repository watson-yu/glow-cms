import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

async function getS3Config() {
  const [rows] = await pool.query("SELECT config_key, config_value FROM system_config WHERE config_key IN ('aws_region','s3_bucket_name','aws_access_key','aws_secret_key')");
  return Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
}

function getClient(cfg) {
  return new S3Client({
    region: cfg.aws_region,
    credentials: { accessKeyId: cfg.aws_access_key, secretAccessKey: cfg.aws_secret_key },
  });
}

const ALLOWED_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif" };
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (!ALLOWED_TYPES[file.type]) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });

    const cfg = await getS3Config();
    const ext = ALLOWED_TYPES[file.type];
    const key = `site/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await getClient(cfg).send(new PutObjectCommand({
      Bucket: cfg.s3_bucket_name,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }));

    const url = `https://${cfg.s3_bucket_name}.s3.${cfg.aws_region}.amazonaws.com/${key}`;
    return NextResponse.json({ url });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {

    const { url } = await req.json();
    if (!url) return NextResponse.json({ ok: true });

    const cfg = await getS3Config();
    const expectedPrefix = `https://${cfg.s3_bucket_name}.s3.${cfg.aws_region}.amazonaws.com/site/`;
    if (!url.startsWith(expectedPrefix)) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    const key = url.slice(url.indexOf(".amazonaws.com/") + 15);
    if (key) {
      await getClient(cfg).send(new DeleteObjectCommand({ Bucket: cfg.s3_bucket_name, Key: key }));
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
