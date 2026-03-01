import { v } from "convex/values";

import { verifyAuth } from "./auth";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

/**
 * Returns all files belonging to a project.
 *
 * Input:  A project ID
 * Output: Array of all file records for the project
 *
 * Used for: Loading a full project file tree
 */
export const getFiles = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    return await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

/**
 * Builds the full path to a file by traversing up the parent chain.
 *
 * Input:  A file ID (e.g., the ID of "button.tsx")
 * Output: Array of ancestors from root to file: [{ _id, name: "src" }, { _id, name: "components" }, { _id, name: "button.tsx" }]
 *
 * Used for: Breadcrumbs navigation (src > components > button.tsx)
 */
export const getFilePath = query({
  args: { id: v.id("files") },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const file = await ctx.db.get("files", args.id);

    if (!file) {
      throw new Error("File not found");
    }

    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    const path: { _id: string; name: string }[] = [];
    let currentId: Id<"files"> | undefined = args.id;

    while (currentId) {
      const file = (await ctx.db.get("files", currentId)) as
        | Doc<"files">
        | undefined;
      if (!file) break;

      path.unshift({ _id: file._id, name: file.name });
      currentId = file.parentId;
    }

    return path;
  },
});

/**
 * Returns a single file by its ID.
 *
 * Input:  A file ID
 * Output: The matching file record
 *
 * Used for: Opening a file in the editor
 */
export const getFile = query({
  args: { id: v.id("files") },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const file = await ctx.db.get("files", args.id);

    if (!file) {
      throw new Error("File not found");
    }

    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    return file;
  },
});

/**
 * Returns the immediate children of a folder, sorted folders-first then alphabetically.
 *
 * Input:  A project ID and an optional parent folder ID (omit for root)
 * Output: Array of file/folder records — folders first, then files, each group sorted A–Z
 *
 * Used for: Rendering a single level of the file explorer tree
 */
export const getFolderContents = query({
  args: { projectId: v.id("projects"), parentId: v.optional(v.id("files")) },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId)
      )
      .collect();

    // Sort: folders first, then files, alphabetically within each group
    return files.sort((a, b) => {
      // Folders come before files
      if (a.type === "folder" && b.type === "file") {
        return -1;
      }
      if (a.type === "file" && b.type === "folder") {
        return 1;
      }

      // Within same type, sort alphabetically by name
      return a.name.localeCompare(b.name);
    });
  },
});

/**
 * Creates a new file inside a project, guarding against name collisions.
 *
 * Input:  Project ID, optional parent folder ID, file name, and initial content
 * Output: void — throws if a file with the same name already exists in that folder
 *
 * Used for: Adding a new file from the file explorer
 */
export const createFile = mutation({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    // Check if a file with the same name already exists in this parent folder
    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId)
      )
      .collect();

    const existing = files.find(
      (file) => file.name === args.name && file.type === "file"
    );

    if (existing) throw new Error("File already exists");

    const now = Date.now();

    await ctx.db.insert("files", {
      projectId: args.projectId,
      name: args.name,
      type: "file",
      content: args.content,
      parentId: args.parentId,
      updatedAt: now,
    });

    await ctx.db.patch("projects", project._id, {
      updatedAt: now,
    });
  },
});

/**
 * Creates a new folder inside a project, guarding against name collisions.
 *
 * Input:  Project ID, optional parent folder ID, and folder name
 * Output: void — throws if a folder with the same name already exists in that location
 *
 * Used for: Adding a new folder from the file explorer
 */
export const createFolder = mutation({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    // Check if a file with the same name already exists in this parent folder
    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId)
      )
      .collect();

    const existing = files.find(
      (file) => file.name === args.name && file.type === "folder"
    );

    if (existing) throw new Error("Folder already exists");

    const now = Date.now();

    await ctx.db.insert("files", {
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      type: "folder",
      updatedAt: now,
    });

    await ctx.db.patch("projects", project._id, {
      updatedAt: now,
    });
  },
});

/**
 * Renames a file or folder, checking for name conflicts among siblings.
 *
 * Input:  A file/folder ID and the new name
 * Output: void — throws if another item with the same name and type exists in the same location
 *
 * Used for: Renaming items in the file explorer
 */
export const renameFile = mutation({
  args: {
    id: v.id("files"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const file = await ctx.db.get("files", args.id);

    if (!file) {
      throw new Error("File not found");
    }

    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    // Check if a file with the new name already exists in the same parent folder
    const sibilings = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", file.projectId).eq("parentId", file.parentId)
      )
      .collect();

    const existing = sibilings.find(
      (sibling) =>
        sibling.name === args.name &&
        sibling.type === file.type &&
        sibling._id !== args.id
    );

    if (existing)
      throw new Error(
        `A ${file.type} with this name already exists in this location`
      );

    const now = Date.now();

    // Update the file's name
    await ctx.db.patch("files", args.id, {
      name: args.name,
      updatedAt: now,
    });

    await ctx.db.patch("projects", project._id, {
      updatedAt: now,
    });
  },
});

/**
 * Deletes a file or folder and all of its descendants recursively.
 *
 * Input:  A file/folder ID
 * Output: void — removes all nested children before deleting the target
 *
 * Used for: Deleting items from the file explorer
 */
export const deleteFile = mutation({
  args: {
    id: v.id("files"),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const file = await ctx.db.get("files", args.id);

    if (!file) {
      throw new Error("File not found");
    }

    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    /**
     * Recursively deletes a file or folder and all of its children.
     *
     * Input:  A file ID to delete
     * Output: void — depth-first traversal ensures children are removed before parents
     *
     * Used for: Implementing recursive deletion inside deleteFile
     */
    const deleteRecursive = async (fileId: Id<"files">) => {
      const item = await ctx.db.get("files", fileId);

      if (!item) return;

      // If it's a folder, delete all children first
      if (item.type === "folder") {
        const children = await ctx.db
          .query("files")
          .withIndex("by_project_parent", (q) =>
            q.eq("projectId", item.projectId).eq("parentId", fileId)
          )
          .collect();
        for (const child of children) {
          await deleteRecursive(child._id);
        }
      }

      // Delete storage file if it exists
      if (item.storageId) {
        await ctx.storage.delete(item.storageId);
      }

      await ctx.db.delete("files", fileId);
    };

    await deleteRecursive(args.id);

    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });
  },
});

/**
 * Overwrites the content of an existing file.
 *
 * Input:  A file ID and the new content string
 * Output: void — also updates the project's updatedAt timestamp
 *
 * Used for: Saving editor changes to a file
 */
export const updateFile = mutation({
  args: {
    id: v.id("files"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const file = await ctx.db.get("files", args.id);

    if (!file) {
      throw new Error("File not found");
    }

    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    const now = Date.now();

    await ctx.db.patch("files", args.id, {
      content: args.content,
      updatedAt: now,
    });

    await ctx.db.patch("projects", project._id, {
      updatedAt: now,
    });
  },
});
