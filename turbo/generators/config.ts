import type { PlopTypes } from "@turbo/gen";

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  // Generator to run dev for a specific package
  plop.setGenerator("dev", {
    description: "Start dev server for a package",
    prompts: [
      {
        type: "list",
        name: "package",
        message: "Which package to run?",
        choices: [
          { name: "Extension", value: "@battlereport/extension" },
          { name: "Web App", value: "@battlereport/web" },
          { name: "MCP Server", value: "wh40k-rules-mcp" },
        ],
      },
    ],
    actions: (answers) => {
      return [
        {
          type: "shell",
          command: `turbo dev --filter=${answers?.package}`,
        },
      ];
    },
  });

  // Generator to create a new package
  plop.setGenerator("new-package", {
    description: "Create a new package in the monorepo",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Package name (without @battlereport/ prefix):",
      },
      {
        type: "list",
        name: "type",
        message: "Package type:",
        choices: ["library", "app"],
      },
    ],
    actions: (answers) => {
      const dir = answers?.type === "app" ? "apps" : "packages";
      return [
        {
          type: "addMany",
          destination: `${dir}/{{name}}`,
          templateFiles: "templates/package/**/*",
          base: "templates/package",
        },
      ];
    },
  });

  // Generator to run data generation scripts
  plop.setGenerator("generate", {
    description: "Run data generation scripts",
    prompts: [
      {
        type: "list",
        name: "script",
        message: "Which script to run?",
        choices: [
          { name: "Generate Factions", value: "generate:factions" },
          { name: "Generate Stratagems", value: "generate:stratagems" },
          { name: "Generate Aliases", value: "generate:aliases" },
        ],
      },
    ],
    actions: (answers) => {
      return [
        {
          type: "shell",
          command: `npm run ${answers?.script}`,
        },
      ];
    },
  });
}
