type MappedTarget = {
    port?: number;
    target?: string;
    rewrite?: string | null;
    description?: string | null;
    status?: string | null;
}

type ConfigFile = {
    mappings: {
        [key: string]: MappedTarget | string | number
    };
    port?: number;
}