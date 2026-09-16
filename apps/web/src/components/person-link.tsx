import { Link } from "react-router-dom";

// Wraps a student/staff name in a link to their profile page
// (/students/:id, /staff/:id), for on-screen list/table views. Never use
// this inside a data-print-area block -- a printed document can't be
// clicked, so those stay plain text.
export function PersonLink({ type, id, name }: { type: "student" | "staff"; id: string; name: string }) {
  return (
    <Link to={`/${type === "student" ? "students" : "staff"}/${id}`} className="text-primary hover:underline">
      {name}
    </Link>
  );
}
