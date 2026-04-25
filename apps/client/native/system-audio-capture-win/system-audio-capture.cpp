// system-audio-capture.exe
//
// Two modes:
//   --list-sessions
//        Enumerate active audio sessions on the default render endpoint.
//        Prints one TSV line per session: "<pid>\t<image_name>\t<display_name>".
//        Uses CP_UTF8 for output so the parent process can decode safely.
//   --exclude-pid <PID>  / --include-pid <PID>
//        Capture system audio via WASAPI process-loopback. Output is raw PCM,
//        signed 16-bit LE, 48000 Hz, 2 channels, interleaved on stdout.
//
// Capture mode requires PROCESS_LOOPBACK_MODE WASAPI activation params,
// officially Windows 10 build 20348+. Older builds fail at activation —
// the host treats that as "feature unavailable" and falls back.

#include <Windows.h>
#include <iostream>
#include <io.h>
#include <fcntl.h>
#include <wchar.h>
#include <string>
#include <mmdeviceapi.h>
#include <audiopolicy.h>
#include <wrl/implements.h>
#include <wil/com.h>
#include <wil/result.h>
#include "LoopbackCapture.h"

static int PrintUsage()
{
	std::wcerr
		<< L"Usage:\n"
		<< L"  system-audio-capture.exe --list-sessions\n"
		<< L"  system-audio-capture.exe --exclude-pid <PID>\n"
		<< L"  system-audio-capture.exe --include-pid <PID>\n";
	return 2;
}

static std::string WideToUtf8(const wchar_t* w)
{
	if (!w || !*w) return std::string();
	int needed = WideCharToMultiByte(CP_UTF8, 0, w, -1, nullptr, 0, nullptr, nullptr);
	if (needed <= 1) return std::string();
	std::string out(needed - 1, '\0');
	WideCharToMultiByte(CP_UTF8, 0, w, -1, &out[0], needed, nullptr, nullptr);
	return out;
}

// Replace tab and newline with spaces so the TSV stays one-line-per-session.
static std::string Sanitize(std::string s)
{
	for (char& c : s) {
		if (c == '\t' || c == '\n' || c == '\r') c = ' ';
	}
	return s;
}

static int ListSessions()
{
	HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
	if (FAILED(hr)) {
		std::wcerr << L"CoInitializeEx failed: 0x" << std::hex << hr << L"\n";
		return 1;
	}

	wil::com_ptr_nothrow<IMMDeviceEnumerator> deviceEnum;
	hr = CoCreateInstance(
		__uuidof(MMDeviceEnumerator),
		nullptr,
		CLSCTX_ALL,
		IID_PPV_ARGS(&deviceEnum));
	if (FAILED(hr)) { std::wcerr << L"MMDeviceEnumerator: 0x" << std::hex << hr << L"\n"; CoUninitialize(); return 1; }

	wil::com_ptr_nothrow<IMMDevice> device;
	hr = deviceEnum->GetDefaultAudioEndpoint(eRender, eMultimedia, &device);
	if (FAILED(hr)) { std::wcerr << L"GetDefaultAudioEndpoint: 0x" << std::hex << hr << L"\n"; CoUninitialize(); return 1; }

	wil::com_ptr_nothrow<IAudioSessionManager2> sessionMgr;
	hr = device->Activate(
		__uuidof(IAudioSessionManager2),
		CLSCTX_ALL,
		nullptr,
		(void**)&sessionMgr);
	if (FAILED(hr)) { std::wcerr << L"IAudioSessionManager2: 0x" << std::hex << hr << L"\n"; CoUninitialize(); return 1; }

	wil::com_ptr_nothrow<IAudioSessionEnumerator> sessionEnum;
	hr = sessionMgr->GetSessionEnumerator(&sessionEnum);
	if (FAILED(hr)) { std::wcerr << L"GetSessionEnumerator: 0x" << std::hex << hr << L"\n"; CoUninitialize(); return 1; }

	int count = 0;
	sessionEnum->GetCount(&count);

	for (int i = 0; i < count; i++) {
		wil::com_ptr_nothrow<IAudioSessionControl> control;
		if (FAILED(sessionEnum->GetSession(i, &control))) continue;

		wil::com_ptr_nothrow<IAudioSessionControl2> control2;
		if (FAILED(control->QueryInterface(IID_PPV_ARGS(&control2)))) continue;

		// Skip the system-sounds session (PID 0).
		DWORD pid = 0;
		if (FAILED(control2->GetProcessId(&pid)) || pid == 0) continue;

		// Skip inactive sessions (Windows holds onto closed sessions briefly).
		AudioSessionState state = AudioSessionStateInactive;
		control->GetState(&state);
		if (state == AudioSessionStateExpired) continue;

		// Process image name (e.g. "spotify.exe").
		std::wstring imageBase = L"unknown";
		HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
		if (hProcess) {
			wchar_t imagePath[MAX_PATH] = { 0 };
			DWORD size = MAX_PATH;
			if (QueryFullProcessImageNameW(hProcess, 0, imagePath, &size)) {
				const wchar_t* slash = wcsrchr(imagePath, L'\\');
				imageBase = slash ? slash + 1 : imagePath;
			}
			CloseHandle(hProcess);
		}

		// Display name (often empty; apps set it via SetDisplayName).
		wil::unique_cotaskmem_string displayName;
		std::wstring display;
		if (SUCCEEDED(control2->GetDisplayName(&displayName)) && displayName) {
			display = displayName.get();
		}

		std::string imageU8 = Sanitize(WideToUtf8(imageBase.c_str()));
		std::string displayU8 = Sanitize(WideToUtf8(display.c_str()));

		// printf("%lu\t%s\t%s\n", pid, ...) — direct stdout write so we don't
		// fight with std::wcout's locale handling.
		printf("%lu\t%s\t%s\n", (unsigned long)pid, imageU8.c_str(), displayU8.c_str());
	}

	CoUninitialize();
	fflush(stdout);
	return 0;
}

int wmain(int argc, wchar_t* argv[])
{
	if (argc < 2) return PrintUsage();

	if (wcscmp(argv[1], L"--list-sessions") == 0) {
		return ListSessions();
	}

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

	int ch = std::getchar();
	(void)ch;

	return 0;
}
