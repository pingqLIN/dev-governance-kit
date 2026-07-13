export function resolveEnvValue(variableName, options = {}) {
  const env = options.env ?? process.env;
  const candidates = [variableName, ...(options.aliases ?? [])];

  for (const candidate of candidates) {
    const value = env[candidate];
    if (typeof value === "string" && value.trim() !== "") {
      return {
        ok: true,
        name: candidate,
        value
      };
    }
  }

  if (options.required) {
    throw new Error(`Missing required environment variable: ${variableName}`);
  }

  return {
    ok: false,
    name: variableName,
    value: undefined
  };
}

export function credentialStatus(variableNames, options = {}) {
  const env = options.env ?? process.env;
  return variableNames.map((name) => ({
    name,
    present: typeof env[name] === "string" && env[name].trim() !== ""
  }));
}
