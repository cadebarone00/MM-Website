import Link from "next/link";
import { CourseNameEditor } from "@/components/portal/tiger/CourseNameEditor";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { CourseTeeSetEditor } from "@/components/portal/tiger/CourseTeeSetEditor";
import type { LiveCourse, LiveHole } from "@/lib/live/types";

export default async function EditCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");
  const service = createSupabaseServiceRoleClient();
  const { data } = await service.from("live_courses").select("id, name, holes, rating, slope, tee_sets").eq("id", courseId).maybeSingle();
  if (!data) notFound();
  const course: LiveCourse = { id: data.id, name: data.name, holes: data.holes as LiveHole[], rating: data.rating, slope: data.slope, teeSets: Array.isArray(data.tee_sets) ? data.tee_sets : [] };
  return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-7"><Link href="/portal/admin/course-library" className="font-condensed text-xs font-bold uppercase tracking-wide text-ink-500 hover:text-maroon-700">← Course Library</Link><section className="mt-5 rounded-xl border border-gold-300 bg-cream-50 p-5"><p className="font-condensed text-2xs font-bold uppercase tracking-[0.16em] text-ink-500">Global course</p><h1 className="mt-1 font-serif text-3xl font-bold text-ink-900">{course.name}</h1><CourseNameEditor id={course.id} name={course.name} /><p className="mt-2 font-sans text-sm text-ink-600">Create every tee set here. Each has its own yardages, course rating, and slope; individual rounds can mix these tee sets hole by hole.</p><CourseTeeSetEditor course={course} /></section></main>;
}
