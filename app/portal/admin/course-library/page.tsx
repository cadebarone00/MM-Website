import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { CourseLibraryPanel } from "@/components/portal/tiger/CourseLibraryPanel";
import type { LiveCourse, LiveHole } from "@/lib/live/types";

export default async function CourseLibraryPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");
  const service = createSupabaseServiceRoleClient();
  const { data } = await service.from("live_courses").select("id, name, holes, rating, slope").order("name");
  const courses: LiveCourse[] = (data ?? []).map((course) => ({ id: course.id, name: course.name, holes: course.holes as LiveHole[], rating: course.rating, slope: course.slope }));
  return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-7"><CourseLibraryPanel initialCourses={courses} /></main>;
}
