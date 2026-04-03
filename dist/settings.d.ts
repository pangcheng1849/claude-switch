export interface ClaudeSettings {
    env?: Record<string, string | number>;
    [key: string]: unknown;
}
export interface McpServerConfig {
    type?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    [key: string]: unknown;
}
export declare function readSettings(): Promise<ClaudeSettings>;
export declare function writeSettings(settings: ClaudeSettings): Promise<void>;
/**
 * Read MCP servers from ~/.claude.json (user scope).
 */
export declare function readMcpServers(): Promise<Record<string, McpServerConfig>>;
/**
 * Write MCP servers to ~/.claude.json (user scope).
 */
export declare function writeMcpServers(mcpServers: Record<string, McpServerConfig>): Promise<void>;
