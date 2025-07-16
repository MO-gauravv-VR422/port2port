
/**
 * Renders the main screen for the proxy server.
 * Displays the current port, instructions for mapping paths,
 * and the current path mappings in a table format.
 * @param rl Readline interface for user input
 * @param PORT Hosting port for the proxy server
 * @param subdomains Map of path mappings
 */
export const renderScreen = (rl) => (PORT: number, subdomains: Record<string, Map<string, MappedTarget>>) => {
    console.clear();
    console.log(`⚙️ Proxy server running at: http://localhost:${PORT}`);
    console.log('📥 Instructions:');
    console.log('  - Type a port (e.g., 5000) to map root path "/"');
    console.log('  - Type a path>port or path>port/rewrite or path>fullURL to map custom paths\n');

    if (subdomains["."].size === 0) {
        console.log('🔁 No path mappings yet.');
    } else {
        console.log('🔁 Current Path Mappings:');
        console.table(
            Array.from(Object.keys(subdomains)).map((subd) => {
                return Array.from(subdomains[subd].entries()).map(([path, conf]) => {
                    if (conf.target) {
                        return {
                            Subdomain: subd == "." ? "" : subd,
                            Path: path,
                            '→ Proxy To': conf.target,
                            "Description": conf.description || '--',
                            "Status": conf.status || ''
                        };
                    } else {
                        return {
                            Subdomain: subd == "." ? "" : subd,
                            Path: path,
                            '→ Proxy To': `http://localhost:${conf.port}${conf.rewrite
                                ? ` (rewrite: ${conf.rewrite})` : ''}`,
                            "Description": conf.description || '--',
                            "Status": conf.status || ''
                        };
                    }
                })
            }).flat(1)
        );
    }
    rl.prompt();
};