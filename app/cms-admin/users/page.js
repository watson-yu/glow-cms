"use client";
import { useEffect, useState } from "react";
import { fmtDate, useTzRefresh } from "@/lib/fmt";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  useTzRefresh();
  useEffect(() => { fetch("/api/users").then(r => r.json()).then(setUsers); }, []);

  return (
    <>
      <div className="page-header"><h1>Users</h1></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th></th><th>Email</th><th>Name</th><th>Role</th><th>Last Login</th><th>Registered</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ width: 36 }}>
                  {u.image ? <img src={u.image} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} /> : "👤"}
                </td>
                <td style={{ fontWeight: 500 }}>{u.email}</td>
                <td>{u.name || "—"}</td>
                <td><span className="badge badge-published">{u.role}</span></td>
                <td style={{ fontSize: 12, fontFamily: "monospace" }}>{fmtDate(u.last_login)}</td>
                <td style={{ fontSize: 12, fontFamily: "monospace" }}>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>No users yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
