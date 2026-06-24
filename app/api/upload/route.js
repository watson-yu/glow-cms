import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import pool from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { validateImageUpload } from "@/lib/uploadValidation";

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

export async function POST(req) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  let file;
  try {
    const formData = await req.formData();
    file = formData.get("file");
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  // Validate type/extension/size up front, before buffering into memory.
  const check = validateImageUpload(file);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  // Use only the server-validated extension/Content-Type for the stored object,
  // never the attacker-controlled filename or client-supplied MIME type.
  try {
    const cfg = await getS3Config();
    const key = `site/logo-${Date.now()}.${check.ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await getClient(cfg).send(new PutObjectCommand({
      Bucket: cfg.s3_bucket_name,
      Key: key,
      Body: buffer,
      ContentType: check.contentType,
    }));

    const url = `https://${cfg.s3_bucket_name}.s3.${cfg.aws_region}.amazonaws.com/${key}`;
    return NextResponse.json({ url });
  } catch {
    // Don't leak internal/S3 error details to the client.
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const { url } = await req.json();
  if (!url) return NextResponse.json({ ok: true });

  const cfg = await getS3Config();
  const key = url.split(".amazonaws.com/")[1];
  if (key) {
    await getClient(cfg).send(new DeleteObjectCommand({ Bucket: cfg.s3_bucket_name, Key: key }));
  }
  return NextResponse.json({ ok: true });
}
