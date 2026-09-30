"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import styles from "../TournamentDashboard.module.css";
import { EditorActions, Field, asInput, type EditorProps } from "../editorKit";

type CourseRow = { id: string | null; name: string; city: string; state: string; teeName: string; par: string; yards: string; rating: string; slope: string };

export function CoursesEditor({ setup, saving, onSave, onCancel }: EditorProps) {
  const [courses, setCourses] = useState<CourseRow[]>(setup.courses.map((course) => ({
    id: course.id, name: course.name, city: course.city ?? "", state: course.state ?? "", teeName: course.teeName ?? "",
    par: asInput(course.par), yards: asInput(course.yards), rating: asInput(course.rating), slope: asInput(course.slope),
  })));
  const update = (index: number, patch: Partial<CourseRow>) => setCourses((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const text = (index: number, key: keyof CourseRow, label: string, type = "text") =>
    <Field label={label}><input type={type} value={courses[index][key] ?? ""} onChange={(event) => update(index, { [key]: event.target.value })} /></Field>;
  return <form onSubmit={(event) => { event.preventDefault(); onSave({ courses }); }} noValidate>
    <div className={base.fields}>
      <p className={base.muted}>Courses you plan to play. Scores are entered against them once live scoring opens.</p>
      <div className={styles.rows}>{courses.map((course, index) =>
        <div className={styles.row} key={course.id ?? `new-${index}`}>
          <div className={base.columns}>{text(index, "name", `Course ${index + 1} name`)}{text(index, "teeName", "Tees")}</div>
          <div className={base.columns}>{text(index, "city", "City")}{text(index, "state", "State / region")}</div>
          <div className={styles.row5}>
            {text(index, "par", "Par", "number")}{text(index, "yards", "Yards", "number")}{text(index, "rating", "Rating", "number")}{text(index, "slope", "Slope", "number")}
            <button type="button" className={styles.removeButton} onClick={() => setCourses((rows) => rows.filter((_, i) => i !== index))} aria-label={`Remove course ${index + 1}`}>Remove</button>
          </div>
        </div>)}
      </div>
      <button type="button" className={base.textButton} onClick={() => setCourses((rows) => [...rows, { id: null, name: "", city: "", state: "", teeName: "", par: "", yards: "", rating: "", slope: "" }])}>+ Add a course</button>
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}
