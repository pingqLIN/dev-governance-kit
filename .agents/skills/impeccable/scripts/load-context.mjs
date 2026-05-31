import fs from "node:fs";
import path from "node:path";

const PRODUCT_NAMES = ["PRODUCT.md", "Product.md", "product.md"];
const DESIGN_NAMES = ["DESIGN.md", "Design.md", "design.md"];
const LEGACY_NAMES = [".impeccable.md"];
const FALLBACK_DIRS = [".agents/context", "docs"];

export function resolveContextDir(cwd = process.cwd()) {
  const envDir = process.env.IMPECCABLE_CONTEXT_DIR;
  if (envDir?.trim()) {
    const trimmed = envDir.trim();
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
  }

  if (firstExisting(cwd, [...PRODUCT_NAMES, ...DESIGN_NAMES, ...LEGACY_NAMES])) {
    return cwd;
  }

  for (const relativeDir of FALLBACK_DIRS) {
    const candidate = path.resolve(cwd, relativeDir);
    if (firstExisting(candidate, [...PRODUCT_NAMES, ...DESIGN_NAMES])) {
      return candidate;
    }
  }

  return cwd;
}

export function loadContext(cwd = process.cwd()) {
  let migrated = false;
  const contextDir = resolveContextDir(cwd);
  let productPath = firstExisting(contextDir, PRODUCT_NAMES);

  if (!productPath && contextDir === cwd) {
    const legacyPath = firstExisting(cwd, LEGACY_NAMES);
    if (legacyPath) {
      const newPath = path.join(cwd, "PRODUCT.md");
      try {
        fs.renameSync(legacyPath, newPath);
        productPath = newPath;
        migrated = true;
      } catch {
        productPath = legacyPath;
      }
    }
  }

  const designPath = firstExisting(contextDir, DESIGN_NAMES);
  const product = productPath ? safeRead(productPath) : null;
  const design = designPath ? safeRead(designPath) : null;

  return {
    hasProduct: Boolean(product),
    product,
    productPath: productPath ? path.relative(cwd, productPath) : null,
    hasDesign: Boolean(design),
    design,
    designPath: designPath ? path.relative(cwd, designPath) : null,
    migrated,
    contextDir
  };
}

function firstExisting(dir, names) {
  for (const name of names) {
    const absolutePath = path.join(dir, name);
    if (fs.existsSync(absolutePath)) return absolutePath;
  }
  return null;
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

if (process.argv[1]?.endsWith("load-context.mjs")) {
  console.log(JSON.stringify(loadContext(process.cwd()), null, 2));
}
