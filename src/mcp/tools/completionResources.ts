import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readCompletionEnvelope } from "../../completionInbox.js";

export function registerCompletionResources(server: McpServer): void {
  const template = new ResourceTemplate("oracle-completion://{id}", { list: undefined });

  server.registerResource(
    "oracle-completion",
    template,
    {
      title: "oracle completion inbox resources",
      description: "Read a stored completion inbox item by id.",
    },
    async (uri, variables) => {
      const idRaw = variables?.id;
      const id = Array.isArray(idRaw) ? idRaw[0] : (idRaw as string);
      if (!id) {
        throw new Error("Missing completion inbox item id");
      }
      const item = await readCompletionEnvelope(id);
      if (!item) {
        throw new Error(`Completion inbox item "${id}" not found.`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(item, null, 2),
          },
        ],
      };
    },
  );
}
