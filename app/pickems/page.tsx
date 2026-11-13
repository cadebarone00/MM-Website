import { redirect } from "next/navigation";

/** Pick'ems was replaced by Leagues (project_specs.md "Feature: Leagues"). */
export default function PickemsPage() {
  redirect("/leagues");
}
