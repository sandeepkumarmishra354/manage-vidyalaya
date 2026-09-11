use rusqlite::params;
use tauri::State;

use crate::models::{IssueBookInput, LibraryBook, LibraryIssueListItem, NewLibraryBookInput};
use crate::state::{current_tenant_id, enqueue_outbox_from_row, AppState};

#[tauri::command]
pub fn create_book(state: State<AppState>, input: NewLibraryBookInput) -> Result<LibraryBook, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO library_books (
            id, tenant_id, branch_id, title, author, isbn, category, total_copies, available_copies, updated_at, version
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9, 1)",
        params![
            id,
            tenant_id,
            input.branch_id,
            input.title,
            input.author,
            input.isbn,
            input.category,
            input.total_copies,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "library_books", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(LibraryBook {
        id,
        branch_id: input.branch_id,
        title: input.title,
        author: input.author,
        isbn: input.isbn,
        category: input.category,
        total_copies: input.total_copies,
        available_copies: input.total_copies,
    })
}

#[tauri::command]
pub fn list_books(state: State<AppState>, branch_id: String, search: Option<String>) -> Result<Vec<LibraryBook>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let search_pattern = format!("%{}%", search.unwrap_or_default().to_lowercase());

    let mut stmt = conn
        .prepare(
            "SELECT id, branch_id, title, author, isbn, category, total_copies, available_copies
             FROM library_books
             WHERE branch_id = ?1 AND deleted_at IS NULL
               AND (lower(title) LIKE ?2 OR lower(coalesce(author, '')) LIKE ?2)
             ORDER BY title",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![branch_id, search_pattern], |row| {
            Ok(LibraryBook {
                id: row.get(0)?,
                branch_id: row.get(1)?,
                title: row.get(2)?,
                author: row.get(3)?,
                isbn: row.get(4)?,
                category: row.get(5)?,
                total_copies: row.get(6)?,
                available_copies: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Issues a copy of a book to a student: decrements available_copies and
/// creates an issue record, refusing if no copies are available.
#[tauri::command]
pub fn issue_book(state: State<AppState>, input: IssueBookInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let (branch_id, available): (String, i64) = tx
        .query_row(
            "SELECT branch_id, available_copies FROM library_books WHERE id = ?1",
            [&input.book_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("book not found: {e}"))?;

    if available <= 0 {
        return Err("no copies available to issue".to_string());
    }

    tx.execute(
        "UPDATE library_books SET available_copies = available_copies - 1, updated_at = ?1, version = version + 1
         WHERE id = ?2",
        params![now, input.book_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "library_books", &input.book_id, "update").map_err(|e| e.to_string())?;

    let issue_id = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO library_issues (
            id, tenant_id, branch_id, book_id, student_id, issued_date, due_date, status, updated_at, version
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'issued', ?6, 1)",
        params![issue_id, tenant_id, branch_id, input.book_id, input.student_id, now, input.due_date],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "library_issues", &issue_id, "insert").map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn return_book(state: State<AppState>, issue_id: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let book_id: String = tx
        .query_row("SELECT book_id FROM library_issues WHERE id = ?1", [&issue_id], |row| row.get(0))
        .map_err(|e| format!("issue not found: {e}"))?;

    tx.execute(
        "UPDATE library_issues SET status = 'returned', returned_date = ?1, updated_at = ?1, version = version + 1
         WHERE id = ?2",
        params![now, issue_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "library_issues", &issue_id, "update").map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE library_books SET available_copies = available_copies + 1, updated_at = ?1, version = version + 1
         WHERE id = ?2",
        params![now, book_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "library_books", &book_id, "update").map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_issues(
    state: State<AppState>,
    branch_id: String,
    status: Option<String>,
) -> Result<Vec<LibraryIssueListItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.book_id, b.title, i.student_id,
                    s.first_name || ' ' || coalesce(s.last_name, ''),
                    i.issued_date, i.due_date, i.returned_date, i.status
             FROM library_issues i
             JOIN library_books b ON b.id = i.book_id
             JOIN students s ON s.id = i.student_id
             WHERE i.branch_id = ?1 AND i.deleted_at IS NULL
               AND (?2 IS NULL OR i.status = ?2)
             ORDER BY i.issued_date DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![branch_id, status], |row| {
            Ok(LibraryIssueListItem {
                id: row.get(0)?,
                book_id: row.get(1)?,
                book_title: row.get(2)?,
                student_id: row.get(3)?,
                student_name: row.get(4)?,
                issued_date: row.get(5)?,
                due_date: row.get(6)?,
                returned_date: row.get(7)?,
                status: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
