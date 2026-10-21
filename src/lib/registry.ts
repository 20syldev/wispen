import { plugins } from "@/plugins";
import { unknownShape } from "@/plugins/core/unknown";
import type {
    CommandDefinition,
    ExporterDefinition,
    ImporterDefinition,
    LocalizedString,
    ShapeDefinition,
    ToolDefinition,
    WispenPlugin,
} from "@/types/plugin";
import type { Locale } from "@/types/settings";

interface Registry {
    plugins: WispenPlugin[];
    shapes: Map<string, ShapeDefinition>;
    tools: ToolDefinition[];
    commands: CommandDefinition[];
    exporters: ExporterDefinition[];
    importers: ImporterDefinition[];
}

/**
 * Collects every contribution of the registered plugins. Later plugins cannot override an id
 * already taken, which keeps core shapes and tools stable whatever the plugin order.
 *
 * @param list - Plugins in registration order
 * @returns Lookup structures for shapes, tools, commands, exporters and importers
 */
function buildRegistry(list: WispenPlugin[]): Registry {
    const shapes = new Map<string, ShapeDefinition>();
    const seen = {
        tools: new Set<string>(),
        commands: new Set<string>(),
        exporters: new Set<string>(),
        importers: new Set<string>(),
    };
    const registry: Registry = {
        plugins: list,
        shapes,
        tools: [],
        commands: [],
        exporters: [],
        importers: [],
    };

    for (const plugin of list) {
        for (const shape of plugin.shapes ?? []) {
            if (!shapes.has(shape.type)) shapes.set(shape.type, shape);
        }
        for (const tool of plugin.tools ?? []) {
            if (!seen.tools.has(tool.id)) registry.tools.push(tool);
            seen.tools.add(tool.id);
        }
        for (const command of plugin.commands ?? []) {
            if (!seen.commands.has(command.id)) registry.commands.push(command);
            seen.commands.add(command.id);
        }
        for (const exporter of plugin.exporters ?? []) {
            if (!seen.exporters.has(exporter.id)) registry.exporters.push(exporter);
            seen.exporters.add(exporter.id);
        }
        for (const importer of plugin.importers ?? []) {
            if (!seen.importers.has(importer.id)) registry.importers.push(importer);
            seen.importers.add(importer.id);
        }
    }
    return registry;
}

const registry = buildRegistry(plugins);

/**
 * Returns the definition of a shape type, or a placeholder for types whose plugin is missing
 * so documents created with other plugins still open.
 *
 * @param type - Type stored on the element, possibly from a plugin that is not installed
 * @returns The registered definition, or unknownShape for unregistered types
 */
export function getShape(type: string): ShapeDefinition {
    return registry.shapes.get(type) ?? unknownShape;
}

/**
 * Tells whether a shape type is registered.
 *
 * @param type - Type stored on an element, e.g. read from an imported document
 * @returns true when a plugin provides it
 */
export function hasShape(type: string): boolean {
    return registry.shapes.has(type);
}

/**
 * Lists registered tools in plugin order.
 *
 * @returns Tools of every plugin, core first, without duplicate ids
 */
export function getTools(): ToolDefinition[] {
    return registry.tools;
}

/**
 * Finds a tool by id.
 *
 * @param id - Id of a registered tool such as "rectangle" or "eraser"
 * @returns The tool, or undefined when unknown
 */
export function getTool(id: string): ToolDefinition | undefined {
    return registry.tools.find((tool) => tool.id === id);
}

/**
 * Lists commands contributed by plugins, the core commands living in lib/editor/commands.ts.
 *
 * @returns Plugin commands in registration order, without duplicate ids
 */
export function getPluginCommands(): CommandDefinition[] {
    return registry.commands;
}

/**
 * Lists registered export formats.
 *
 * @returns Exporters of every plugin, core formats first
 */
export function getExporters(): ExporterDefinition[] {
    return registry.exporters;
}

/**
 * Lists registered import formats.
 *
 * @returns Importers of every plugin, core formats first, tried in this order
 */
export function getImporters(): ImporterDefinition[] {
    return registry.importers;
}

/**
 * Lists the registered plugins.
 *
 * @returns Plugins in registration order
 */
export function getPlugins(): WispenPlugin[] {
    return registry.plugins;
}

/**
 * Resolves a plugin-provided label in the active locale.
 *
 * @param value - Plain string or per-locale translations
 * @param locale - Active locale; English is used when it is missing
 * @returns The text to display
 */
export function localize(value: LocalizedString, locale: Locale): string {
    return typeof value === "string" ? value : (value[locale] ?? value.en);
}
