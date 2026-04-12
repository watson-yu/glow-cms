import { redirect } from "next/navigation";

export default function NewPage() {
  redirect("/cms-admin/pages/new/edit");
}
