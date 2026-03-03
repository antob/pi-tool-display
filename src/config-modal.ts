import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { SettingItem } from "@mariozechner/pi-tui";
import { ZellijModal, ZellijSettingsModal } from "./zellij-modal.js";
import type { ToolDisplayCapabilities } from "./capabilities.js";
import {
	detectToolDisplayPreset,
	getToolDisplayPresetConfig,
	parseToolDisplayPreset,
	TOOL_DISPLAY_PRESETS,
	type ToolDisplayPreset,
} from "./presets.js";
import { type ToolDisplayConfig } from "./types.js";

interface ToolDisplayConfigController {
	getConfig(): ToolDisplayConfig;
	setConfig(next: ToolDisplayConfig, ctx: ExtensionCommandContext): void;
	getCapabilities(): ToolDisplayCapabilities;
}

interface SettingValueSyncTarget {
	updateValue(id: string, value: string): void;
}

interface ModalOverlayOptions {
	anchor: "center";
	width: number;
	maxHeight: number;
	margin: number;
}

const PREVIEW_LINE_VALUES = ["4", "8", "12", "20", "40"];
const BASH_PREVIEW_LINE_VALUES = ["0", "5", "10", "20", "40"];
const PRESET_COMMAND_HINT = TOOL_DISPLAY_PRESETS.join("|");

const MANUAL_CONFIG_PATH_HINT = "~/.pi/agent/extensions/pi-tool-display/config.json";
const MANUAL_CONFIG_MODAL_HINT =
	"Advanced options (tool ownership, diff fine-tuning, truncation/RTK hints) are available in config.json.";

function toOnOff(value: boolean): string {
	return value ? "on" : "off";
}

function toolOwnershipSummary(config: ToolDisplayConfig): string {
	const overrides = config.registerToolOverrides;
	return `read:${toOnOff(overrides.read)},grep:${toOnOff(overrides.grep)},find:${toOnOff(overrides.find)},ls:${toOnOff(overrides.ls)},bash:${toOnOff(overrides.bash)},edit:${toOnOff(overrides.edit)},write:${toOnOff(overrides.write)}`;
}

function summarizeConfig(config: ToolDisplayConfig, capabilities: ToolDisplayCapabilities): string {
	const preset = detectToolDisplayPreset(config);
	const parts = [
		`preset=${preset}`,
		`owners={${toolOwnershipSummary(config)}}`,
		`userBox=${toOnOff(config.enableNativeUserMessageBox)}`,
		`read=${config.readOutputMode}`,
		`search=${config.searchOutputMode}`,
		`preview=${config.previewLines}`,
		`expandedMax=${config.expandedPreviewMaxLines}`,
		`bash=${config.bashCollapsedLines}`,
		`diff=${config.diffViewMode}@${config.diffSplitMinWidth}`,
		`diffLines=${config.diffCollapsedLines}`,
		`diffWrap=${toOnOff(config.diffWordWrap)}`,
	];

	if (capabilities.hasMcpTooling) {
		parts.push(`mcp=${config.mcpOutputMode}`);
	} else {
		parts.push("mcp=auto-hidden");
	}

	if (capabilities.hasRtkOptimizer) {
		parts.push(`rtkHints=${toOnOff(config.showRtkCompactionHints)}`);
	} else {
		parts.push("rtkHints=auto-off");
	}

	return parts.join(", ");
}

function parseNumber(value: string, fallback: number): number {
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

function buildSettingItems(
	config: ToolDisplayConfig,
	capabilities: ToolDisplayCapabilities,
): SettingItem[] {
	const mcpSettings: SettingItem[] = capabilities.hasMcpTooling
		? [
				{
					id: "mcpOutputMode",
					label: "MCP tool output",
					description: "hidden = call only, summary = line count, preview = show lines",
					currentValue: config.mcpOutputMode,
					values: ["hidden", "summary", "preview"],
				},
			]
		: [];

	return [
		{
			id: "preset",
			label: "Preset profile",
			description:
				"Start here. opencode = strict inline-only, balanced = compact summaries, verbose = line previews",
			currentValue: detectToolDisplayPreset(config),
			values: [...TOOL_DISPLAY_PRESETS],
		},
		{
			id: "readOutputMode",
			label: "Read tool output",
			description: "hidden = OpenCode style (path only), summary = line count, preview = show file lines",
			currentValue: config.readOutputMode,
			values: ["hidden", "summary", "preview"],
		},
		{
			id: "searchOutputMode",
			label: "Grep/Find/Ls output",
			description: "hidden = call only, count = match count, preview = show lines",
			currentValue: config.searchOutputMode,
			values: ["hidden", "count", "preview"],
		},
		...mcpSettings,
		{
			id: "previewLines",
			label: "Preview lines (read/search/MCP)",
			description: "Lines shown in collapsed mode when preview mode is enabled",
			currentValue: String(config.previewLines),
			values: PREVIEW_LINE_VALUES,
		},
		{
			id: "bashCollapsedLines",
			label: "Bash collapsed lines",
			description: "OpenCode default is 10; set 0 to hide bash output when collapsed",
			currentValue: String(config.bashCollapsedLines),
			values: BASH_PREVIEW_LINE_VALUES,
		},
		{
			id: "diffViewMode",
			label: "Edit diff layout",
			description: "auto = adaptive, split = force side-by-side, unified = force single-column",
			currentValue: config.diffViewMode,
			values: ["auto", "split", "unified"],
		},
		{
			id: "enableNativeUserMessageBox",
			label: "Native user message box",
			description: "on = render user prompts in bordered box, off = use default Pi user message rendering",
			currentValue: toOnOff(config.enableNativeUserMessageBox),
			values: ["on", "off"],
		},
	];
}

function applyPreset(preset: ToolDisplayPreset): ToolDisplayConfig {
	return getToolDisplayPresetConfig(preset);
}

function applySetting(config: ToolDisplayConfig, id: string, value: string): ToolDisplayConfig {
	switch (id) {
		case "preset": {
			const parsed = parseToolDisplayPreset(value);
			return parsed ? applyPreset(parsed) : config;
		}
		case "enableNativeUserMessageBox":
			return {
				...config,
				enableNativeUserMessageBox: value === "on",
			};
		case "readOutputMode":
			return {
				...config,
				readOutputMode: value as ToolDisplayConfig["readOutputMode"],
			};
		case "searchOutputMode":
			return {
				...config,
				searchOutputMode: value as ToolDisplayConfig["searchOutputMode"],
			};
		case "mcpOutputMode":
			return {
				...config,
				mcpOutputMode: value as ToolDisplayConfig["mcpOutputMode"],
			};
		case "previewLines":
			return {
				...config,
				previewLines: parseNumber(value, config.previewLines),
			};
		case "bashCollapsedLines":
			return {
				...config,
				bashCollapsedLines: parseNumber(value, config.bashCollapsedLines),
			};
		case "diffViewMode":
			return {
				...config,
				diffViewMode: value as ToolDisplayConfig["diffViewMode"],
			};
		default:
			return config;
	}
}

function syncSettingValues(
	settingsList: SettingValueSyncTarget,
	config: ToolDisplayConfig,
	capabilities: ToolDisplayCapabilities,
): void {
	settingsList.updateValue("preset", detectToolDisplayPreset(config));
	settingsList.updateValue("readOutputMode", config.readOutputMode);
	settingsList.updateValue("searchOutputMode", config.searchOutputMode);
	if (capabilities.hasMcpTooling) {
		settingsList.updateValue("mcpOutputMode", config.mcpOutputMode);
	}
	settingsList.updateValue("previewLines", String(config.previewLines));
	settingsList.updateValue("bashCollapsedLines", String(config.bashCollapsedLines));
	settingsList.updateValue("diffViewMode", config.diffViewMode);
	settingsList.updateValue("enableNativeUserMessageBox", toOnOff(config.enableNativeUserMessageBox));
}

function resolveResponsiveOverlayOptions(): ModalOverlayOptions {
	const terminalWidth =
		typeof process.stdout.columns === "number" && Number.isFinite(process.stdout.columns)
			? process.stdout.columns
			: 120;
	const terminalHeight =
		typeof process.stdout.rows === "number" && Number.isFinite(process.stdout.rows)
			? process.stdout.rows
			: 36;

	const margin = 1;
	const availableWidth = Math.max(24, terminalWidth - margin * 2);
	const preferredWidth = terminalWidth >= 140 ? 88 : terminalWidth >= 110 ? 82 : 76;
	const width = Math.max(24, Math.min(preferredWidth, availableWidth));

	const availableHeight = Math.max(10, terminalHeight - margin * 2);
	const preferredHeight = Math.max(10, Math.floor(terminalHeight * 0.8));
	const maxHeight = Math.min(preferredHeight, availableHeight);

	return {
		anchor: "center",
		width,
		maxHeight,
		margin,
	};
}

async function openSettingsModal(ctx: ExtensionCommandContext, controller: ToolDisplayConfigController): Promise<void> {
	const overlayOptions = resolveResponsiveOverlayOptions();
	const capabilities = controller.getCapabilities();

	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => {
			let current = controller.getConfig();
			let settingsModal: ZellijSettingsModal | null = null;

			settingsModal = new ZellijSettingsModal(
				{
					title: "Pi Tool Display Settings",
					description: `Core controls for day-to-day output tuning. ${MANUAL_CONFIG_MODAL_HINT}`,
					settings: buildSettingItems(current, capabilities),
					onChange: (id, newValue) => {
						current = applySetting(current, id, newValue);
						controller.setConfig(current, ctx);
						current = controller.getConfig();
						if (settingsModal) {
							syncSettingValues(settingsModal, current, capabilities);
						}
					},
					onClose: () => done(),
					helpText: `/tool-display preset ${PRESET_COMMAND_HINT} • advanced: edit ${MANUAL_CONFIG_PATH_HINT} • /tool-display show`,
					enableSearch: true,
				},
				theme,
			);

			const modal = new ZellijModal(
				settingsModal,
				{
					borderStyle: "rounded",
					titleBar: {
						left: "Pi Tool Display Settings",
						right: "pi-tool-display",
					},
					helpUndertitle: {
						text: "Esc close | ↑↓ navigate | Space toggle",
						color: "dim",
					},
					overlay: overlayOptions,
				},
				theme,
			);

			return {
				render(width: number) {
					return modal.renderModal(width).lines;
				},
				invalidate() {
					modal.invalidate();
				},
				handleInput(data: string) {
					modal.handleInput(data);
					tui.requestRender();
				},
			};
		},
		{ overlay: true, overlayOptions },
	);
}

function handleToolDisplayArgs(args: string, ctx: ExtensionCommandContext, controller: ToolDisplayConfigController): boolean {
	const raw = args.trim();
	if (!raw) {
		return false;
	}

	const normalized = raw.toLowerCase();

	if (normalized === "show") {
		ctx.ui.notify(
			`tool-display: ${summarizeConfig(controller.getConfig(), controller.getCapabilities())}`,
			"info",
		);
		return true;
	}

	if (normalized === "reset") {
		controller.setConfig(getToolDisplayPresetConfig("opencode"), ctx);
		ctx.ui.notify("Tool display preset reset to opencode.", "info");
		return true;
	}

	if (normalized.startsWith("preset ")) {
		const candidate = normalized.slice("preset ".length).trim();
		const preset = parseToolDisplayPreset(candidate);
		if (!preset) {
			ctx.ui.notify(`Unknown preset. Use: /tool-display preset ${PRESET_COMMAND_HINT}`, "warning");
			return true;
		}

		controller.setConfig(getToolDisplayPresetConfig(preset), ctx);
		ctx.ui.notify(`Tool display preset set to ${preset}.`, "info");
		return true;
	}

	ctx.ui.notify(`Usage: /tool-display [show|reset|preset ${PRESET_COMMAND_HINT}]`, "warning");
	return true;
}

export function registerToolDisplayCommand(pi: ExtensionAPI, controller: ToolDisplayConfigController): void {
	pi.registerCommand("tool-display", {
		description: "Configure tool output rendering (OpenCode-style)",
		handler: async (args, ctx) => {
			if (handleToolDisplayArgs(args, ctx, controller)) {
				return;
			}

			if (!ctx.hasUI) {
				ctx.ui.notify("/tool-display requires interactive TUI mode.", "warning");
				return;
			}

			await openSettingsModal(ctx, controller);
		},
	});
}
