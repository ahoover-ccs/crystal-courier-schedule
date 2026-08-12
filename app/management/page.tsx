import { redirect } from "next/navigation";

export default function ManagementPortalPage() {
  redirect("/schedule?week=current");
}
