"use strict";

const rootSelect = document.getElementById("rootSelect");
const fileRows = document.getElementById("fileRows");
const breadcrumbs = document.getElementById("breadcrumbs");
const statusBox = document.getElementById("status");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const sortSelect = document.getElementById("sortSelect");
const errorToast = document.getElementById("errorToast");

let currentRoot = "";
let currentPath = "";
let currentItems = [];
let searchMode = false;
let toastTimer;

async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status}).`);
    }

    return data;
}

function notify(message, error = false) {
    errorToast.textContent = message;
    errorToast.classList.toggle("error", error);
    errorToast.hidden = false;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        errorToast.hidden = true;
    }, 3500);
}

function showStatus(message, error = false) {
    statusBox.textContent = message;
    statusBox.classList.toggle("error", error);
}

function formatBytes(bytes) {
    if (!bytes) return "—";

    const units = ["B", "KB", "MB", "GB", "TB"];
    let index = 0;
    let value = bytes;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
    }

    return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function typeLabel(type) {
    return ({
        folder: "Folder",
        file: "File",
        symlink: "Symbolic link",
        other: "Other"
    })[type] || type;
}

function iconFor(item) {
    if (item.type === "folder") return "📁";
    if (item.type === "symlink") return "↗";

    const ext = item.name.includes(".")
        ? item.name.split(".").pop().toLowerCase()
        : "";

    if (ext === "pdf") return "📕";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "🖼";
    if (["js", "py", "html", "css", "php", "sql", "json"].includes(ext)) return "💻";
    if (["doc", "docx", "txt", "md"].includes(ext)) return "📄";

    return "📃";
}

function sortedItems(items) {
    const sorted = [...items];
    const mode = sortSelect.value;

    sorted.sort((a, b) => {
        if (mode === "name") {
            if (a.type === "folder" && b.type !== "folder") return -1;
            if (b.type === "folder" && a.type !== "folder") return 1;

            return a.name.localeCompare(b.name, undefined, {
                numeric: true,
                sensitivity: "base"
            });
        }

        if (mode === "type") {
            return typeLabel(a.type).localeCompare(typeLabel(b.type))
                || a.name.localeCompare(b.name);
        }

        if (mode === "size") return b.size - a.size;

        if (mode === "modified") {
            return (b.modified || "").localeCompare(a.modified || "");
        }

        return 0;
    });

    return sorted;
}

/*
 * Windows uses backslashes; Linux uses forward slashes.
 * Split paths for breadcrumbs without changing the path sent to Flask.
 */
function pathParts(path) {
    const normalized = path.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);

    if (/^[A-Za-z]:/.test(normalized)) {
        parts[0] = parts[0].replace(/\/$/, "");
    }

    return parts;
}

function parentPath(path) {
    const trimmed = path.replace(/[\\/]+$/, "");
    const parent = trimmed.replace(/[\\/][^\\/]*$/, "");

    if (!parent) return path.startsWith("/") ? "/" : path;
    if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;

    return parent;
}

function joinPath(parent, child) {
    const separator = parent.includes("\\") ? "\\" : "/";
    return parent.replace(/[\\/]+$/, "") + separator + child;
}

function renderBreadcrumbs() {
    breadcrumbs.replaceChildren();

    if (searchMode) {
        const label = document.createElement("span");
        label.textContent = "Search results";
        breadcrumbs.appendChild(label);
        return;
    }

    const parts = pathParts(currentPath);
    const windowsPath = /^[A-Za-z]:/.test(currentPath);
    let accumulated = windowsPath ? parts[0] + "\\" : "/";

    const rootButton = document.createElement("button");
    rootButton.className = "breadcrumb";
    rootButton.textContent = windowsPath ? parts[0] : "/";
    rootButton.addEventListener("click", () => navigateTo(accumulated));
    breadcrumbs.appendChild(rootButton);

    const start = windowsPath ? 1 : 0;

    for (let i = start; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;

        const separator = document.createElement("span");
        separator.className = "breadcrumb-separator";
        separator.textContent = "›";
        breadcrumbs.appendChild(separator);

        accumulated = joinPath(accumulated, part);

        const button = document.createElement("button");
        button.className = "breadcrumb";
        button.textContent = part;

        const destination = accumulated;
        button.addEventListener("click", () => navigateTo(destination));
        breadcrumbs.appendChild(button);
    }
}

function actionButton(label, callback, danger = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `small-action${danger ? " danger" : ""}`;
    button.textContent = label;
    button.addEventListener("click", callback);
    return button;
}

function renderItems(items) {
    currentItems = items;
    fileRows.replaceChildren();

    const visible = sortedItems(items);

    if (!visible.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.className = "empty";
        cell.textContent = searchMode
            ? "No matching items found."
            : "This folder is empty.";

        row.appendChild(cell);
        fileRows.appendChild(row);
        return;
    }

    for (const item of visible) {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.className = "name-cell";

        const nameButton = document.createElement("button");
        nameButton.type = "button";
        nameButton.className = "item-name";
        nameButton.classList.toggle("folder", item.type === "folder");

        const icon = document.createElement("span");
        icon.className = "item-icon";
        icon.textContent = iconFor(item);

        nameButton.append(icon, document.createTextNode(item.name));
        nameButton.title = item.path;

        if (item.type === "folder") {
            nameButton.addEventListener("click", () => navigateTo(item.path));
        } else if (item.type === "symlink") {
            nameButton.disabled = true;
        }

        nameCell.appendChild(nameButton);

        const typeCell = document.createElement("td");
        typeCell.textContent = typeLabel(item.type);

        const sizeCell = document.createElement("td");
        sizeCell.textContent = item.type === "folder"
            ? "—"
            : formatBytes(item.size);

        const modifiedCell = document.createElement("td");
        modifiedCell.textContent = item.modified || "—";

        const actionsCell = document.createElement("td");
        const group = document.createElement("div");
        group.className = "row-actions";

        if (item.type !== "symlink") {
            group.append(
                actionButton("Rename", () => renameItem(item)),
                actionButton("Copy", () => copyMoveItem(item, "copy")),
                actionButton("Move", () => copyMoveItem(item, "move")),
                actionButton("Trash", () => deleteItem(item), true)
            );
        }

        actionsCell.appendChild(group);
        row.append(nameCell, typeCell, sizeCell, modifiedCell, actionsCell);
        fileRows.appendChild(row);
    }
}

async function loadRoots() {
    showStatus("Discovering available drives and folders...");

    try {
        const data = await api("/api/fs/roots");
        rootSelect.replaceChildren();

        for (const root of data.roots) {
            const option = document.createElement("option");
            option.value = root.path;
            option.textContent = root.name;
            rootSelect.appendChild(option);
        }

        if (!data.roots.length) {
            throw new Error("No accessible filesystem roots were found.");
        }

        currentRoot = data.roots[0].path;
        currentPath = currentRoot;
        rootSelect.value = currentRoot;

        await loadFolder();
    } catch (error) {
        showStatus(error.message, true);
        notify(error.message, true);
    }
}

async function loadFolder() {
    searchMode = false;
    renderBreadcrumbs();
    showStatus("Loading folder...");

    try {
        const params = new URLSearchParams({ path: currentPath });
        const data = await api(`/api/fs/list?${params}`);

        currentPath = data.path;
        renderBreadcrumbs();
        renderItems(data.items);
        showStatus(`${data.items.length} item(s)`);
    } catch (error) {
        renderItems([]);
        showStatus(error.message, true);
    }
}

async function navigateTo(path) {
    currentPath = path;
    searchInput.value = "";
    await loadFolder();
}

async function searchFiles() {
    const q = searchInput.value.trim();

    if (!q) {
        notify("Enter a filename to search.", true);
        return;
    }

    searchMode = true;
    renderBreadcrumbs();
    showStatus("Searching...");

    try {
        const params = new URLSearchParams({
            root: currentRoot,
            q
        });

        const data = await api(`/api/fs/search?${params}`);
        renderItems(data.results);
        renderBreadcrumbs();

        showStatus(
            `${data.results.length} result(s)` +
            (data.truncated ? " — result limit reached." : "")
        );
    } catch (error) {
        renderItems([]);
        showStatus(error.message, true);
    }
}

async function performAction(action, fields) {
    const data = await api("/api/fs/action", {
        method: "POST",
        body: JSON.stringify({ action, ...fields })
    });

    notify(data.message || "Operation completed.");

    if (searchMode) {
        await searchFiles();
    } else {
        await loadFolder();
    }
}

async function createItem(action) {
    const name = prompt(
        action === "create_folder"
            ? "Enter the new folder name:"
            : "Enter the new filename:"
    );

    if (name === null) return;

    try {
        await performAction(action, { path: currentPath, name });
    } catch (error) {
        notify(error.message, true);
    }
}

async function renameItem(item) {
    const name = prompt("Enter the new name:", item.name);

    if (name === null || name === item.name) return;

    try {
        await performAction("rename", {
            source: item.path,
            name
        });
    } catch (error) {
        notify(error.message, true);
    }
}

async function copyMoveItem(item, action) {
    const destination = prompt(
        "Enter the full path of the destination folder:",
        currentPath
    );

    if (destination === null || !destination.trim()) return;

    try {
        await performAction(action, {
            source: item.path,
            destination: destination.trim()
        });
    } catch (error) {
        notify(error.message, true);
    }
}

async function deleteItem(item) {
    if (!confirm(`Move "${item.name}" to the system Trash?`)) return;

    try {
        await performAction("delete", { source: item.path });
    } catch (error) {
        notify(error.message, true);
    }
}

rootSelect.addEventListener("change", async () => {
    currentRoot = rootSelect.value;
    currentPath = currentRoot;
    searchInput.value = "";
    await loadFolder();
});

document.getElementById("refreshButton").addEventListener("click", () => {
    if (searchMode) searchFiles();
    else loadFolder();
});

document.getElementById("newFolderButton").addEventListener("click", () => {
    createItem("create_folder");
});

document.getElementById("newFileButton").addEventListener("click", () => {
    createItem("create_file");
});

searchButton.addEventListener("click", searchFiles);

searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") searchFiles();
});

sortSelect.addEventListener("change", () => {
    renderItems(currentItems);
});

loadRoots();