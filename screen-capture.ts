import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const execFile = promisify(execFileCallback);

const CaptureParams = Type.Object({});

type ScreenCaptureDetails = {
	platform: string;
	bytes: number;
};

function quotePowerShellString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

async function captureWindowsScreen(outputPath: string, signal: AbortSignal | undefined): Promise<void> {
	const outputPathLiteral = quotePowerShellString(outputPath);
	const script = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    $graphics.CopyFromScreen($screen.Left, $screen.Top, 0, 0, $bitmap.Size)
    $bitmap.Save(${outputPathLiteral}, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}
`;

	await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
		windowsHide: true,
		timeout: 30_000,
		signal,
	});
}

export default function screenCapture(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "capture_screen",
		label: "Capture Screen",
		description: "Capture the current Windows desktop and inspect it as an image. Use when the user asks what is on their screen or needs help with a visible application.",
		promptSnippet: "Capture and inspect the current Windows desktop",
		parameters: CaptureParams,
		executionMode: "sequential",
		async execute(_toolCallId, _params, signal): Promise<{ content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>; details: ScreenCaptureDetails }> {
			if (process.platform !== "win32") {
				return {
					content: [{ type: "text", text: "Screen capture is currently implemented for Windows only." }],
					details: { platform: process.platform, bytes: 0 },
				};
			}

			const directory = await mkdtemp(join(tmpdir(), "pi-screen-capture-"));
			const outputPath = join(directory, "screen.png");

			try {
				await captureWindowsScreen(outputPath, signal);
				const image = await readFile(outputPath);
				return {
					content: [
						{ type: "text", text: "Current Windows desktop screenshot:" },
						{ type: "image", data: image.toString("base64"), mimeType: "image/png" },
					],
					details: { platform: process.platform, bytes: image.byteLength },
				};
			} finally {
				await rm(directory, { recursive: true, force: true });
			}
		},
	});
}
