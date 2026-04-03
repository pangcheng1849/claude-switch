export interface MCPDefinition {
    /** Key in mcpServers */
    id: string;
    /** Display name in TUI */
    displayName: string;
    /** Which provider's API key is needed */
    providerId: string;
    /** Short description */
    description: string;
    /** Generate mcpServers entry with injected API key */
    buildConfig(apiKey: string): Record<string, unknown>;
}
/** Per-provider built-in tool support, shown in MCP management */
export declare const MCP_PROVIDER_BUILTIN: Record<string, string>;
export declare const MCP_REGISTRY: MCPDefinition[];
