type MappedTarget = {
    port?: number;
    target?: string;
    rewrite?: string | null;
}

type ConfigFile = {
    mappings: {
        [key: string]: MappedTarget | string | number;
    };
    port?: number;
}