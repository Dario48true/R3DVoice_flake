// system-audio-capture.exe
//
// Captures the Windows audio engine's system mix using WASAPI process loopback,
// optionally excluding a process tree (so RedVoice's own playback is kept out
// of screenshare audio).
//
// Usage:
//   system-audio-capture.exe --exclude-pid <PID>   # all system audio EXCEPT PID's tree
//   system-audio-capture.exe --include-pid <PID>   # only PID's tree
//
// Output: raw PCM, signed 16-bit little-endian, 48000 Hz, 2 channels, interleaved.
// Stop by closing stdin or terminating the process.
//
// Requires the PROCESS_LOOPBACK_MODE WASAPI activation params, which are
// officially supported on Windows 10 build 20348+ / Windows 11 / Server 2022.
// Will fail at activation on earlier builds — the host should treat that as
// "feature unavailable" and fall back.

#include <Windows.h>
#include <iostream>
#include <io.h>
#include <fcntl.h>
#include <wchar.h>
#include "LoopbackCapture.h"

static int PrintUsage()
{
	std::wcerr
		<< L"Usage:\n"
		<< L"  system-audio-capture.exe --exclude-pid <PID>\n"
		<< L"  system-audio-capture.exe --include-pid <PID>\n";
	return 2;
}

int wmain(int argc, wchar_t* argv[])
{
	if (argc != 3) return PrintUsage();

	bool includeProcessTree;
	if (wcscmp(argv[1], L"--exclude-pid") == 0) {
		includeProcessTree = false;
	} else if (wcscmp(argv[1], L"--include-pid") == 0) {
		includeProcessTree = true;
	} else {
		return PrintUsage();
	}

	DWORD processId = wcstoul(argv[2], nullptr, 0);
	if (processId == 0) return PrintUsage();

	if (_setmode(_fileno(stdout), _O_BINARY) == -1) {
		std::wcerr << L"Failed to set stdout to binary mode.\n";
		return 1;
	}

	CLoopbackCapture loopbackCapture;
	HRESULT hr = loopbackCapture.StartCaptureAsync(processId, includeProcessTree);
	if (FAILED(hr)) {
		wil::unique_hlocal_string message;
		FormatMessageW(
			FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS | FORMAT_MESSAGE_ALLOCATE_BUFFER,
			nullptr, hr, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
			(PWSTR)&message, 0, nullptr);
		std::wcerr << L"StartCaptureAsync failed: 0x" << std::hex << hr
				   << L" " << (message ? message.get() : L"(no message)") << L"\n";
		return 3;
	}

	// Block on stdin. The host pipes nothing into stdin during normal operation,
	// so this getchar parks here until the host closes the pipe (= EOF).
	int ch = std::getchar();
	(void)ch;

	return 0;
}
