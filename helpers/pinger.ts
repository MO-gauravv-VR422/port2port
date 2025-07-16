import net from 'net';
import stringWidth from 'string-width';

const alreadyLivePorts: Set<number> = new Set();
/**
 * Checks if the port is live by trying to connect and updates the subdomains map description with dot emoji.
 * This function should be run on intervals to keep the status updated.
 */
export const isPortLivePingChecker = async (subdomains: Record<string, Map<string, MappedTarget>>) => {
    let isNewAnyPortUpdated = false;

    const checkPort = (port: number): Promise<boolean> => {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(1000);

            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.once('timeout', () => {
                socket.destroy();
                resolve(false);
            });

            socket.once('error', () => {
                resolve(false);
            });

            socket.connect(port, '127.0.0.1');
        });
    };

    const tasks: Promise<void>[] = [];

    Object.keys(subdomains).forEach((subdomain) => {
        subdomains[subdomain].forEach((conf, path) => {
            if (conf.port) {
                // console.log("🔍 Checking port:", conf.port);
                tasks.push(
                    checkPort(conf.port).then((isAlive) => {
                        if (isAlive) {
                            const normalize = (str) => str + ' '.repeat(2 - stringWidth(str));
                            conf.status = normalize('✅');

                            if (!alreadyLivePorts.has(conf.port!)) {
                                isNewAnyPortUpdated = true;
                                alreadyLivePorts.add(conf.port!);
                            }
                        } else {
                            if (conf.port && alreadyLivePorts.has(conf.port!)) {
                                conf.status = '❌';
                            } else {
                                conf.status = '⚪️'; // Not live, but not previously known
                            }
                            if (alreadyLivePorts.has(conf.port!)) {
                                isNewAnyPortUpdated = true;
                                alreadyLivePorts.delete(conf.port!);
                            }
                        }
                        // console.log("🔍 Port status:", conf.port, isAlive);
                    })
                );
            } else if (conf.target) {
                conf.status = '🔗'; // No port, just a target
            }
        });
    });

    await Promise.all(tasks);
    return isNewAnyPortUpdated;
};