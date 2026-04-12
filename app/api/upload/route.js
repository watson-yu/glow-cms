import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import pool from "@/lib/db";
import { NextResponse } from "next/server";

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
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const cfg = await getS3Config();
  const ext = file.name.split(".").pop();
  const key = `site/logo-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await getClient(cfg).send(new PutObjectCommand({
    Bucket: cfg.s3_bucket_name,
    Key: key,
    Body: buffer,
    ContentType: file.type,
  }));

  const url = `https://${cfg.s3_bucket_name}.s3.${cfg.aws_region}.amazonaws.com/${key}`;
  return NextResponse.json({ url });
}

export async function DELETE(req) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ ok: true });

  const cfg = await getS3Config();
  const key = url.split(".amazonaws.com/")[1];
  if (key) {
    await getClient(cfg).send(new DeleteObjectCommand({ Bucket: cfg.s3_bucket_name, Key: key }));
  }
  return NextResponse.json({ ok: true });
}
