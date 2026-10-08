declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;

export const REPO_RELEASES_URL = "https://github.com/skill-one/skill-one/releases";
export const LATEST_RELEASE_URL = `${REPO_RELEASES_URL}/latest`;
export const DOWNLOAD_BASE_URL = `${LATEST_RELEASE_URL}/download`;

// macOS (Apple Silicon ARM64 & Intel x64)
export const MAC_ARM_DMG_FILENAME = `Skill.One_${APP_VERSION}_aarch64.dmg`;
export const MAC_ARM_DMG_URL = `${DOWNLOAD_BASE_URL}/${MAC_ARM_DMG_FILENAME}`;
export const MAC_X64_DMG_FILENAME = `Skill.One_${APP_VERSION}_x64.dmg`;
export const MAC_X64_DMG_URL = `${DOWNLOAD_BASE_URL}/${MAC_X64_DMG_FILENAME}`;

// Windows (NSIS Installer & MSI)
export const WIN_EXE_FILENAME = `Skill.One_${APP_VERSION}_x64-setup.exe`;
export const WIN_EXE_URL = `${DOWNLOAD_BASE_URL}/${WIN_EXE_FILENAME}`;
export const WIN_MSI_FILENAME = `Skill.One_${APP_VERSION}_x64_en-US.msi`;
export const WIN_MSI_URL = `${DOWNLOAD_BASE_URL}/${WIN_MSI_FILENAME}`;

// Linux (AppImage & Debian package)
export const LINUX_APPIMAGE_FILENAME = `skill-one_${APP_VERSION}_amd64.AppImage`;
export const LINUX_APPIMAGE_URL = `${DOWNLOAD_BASE_URL}/${LINUX_APPIMAGE_FILENAME}`;
export const LINUX_DEB_FILENAME = `skill-one_${APP_VERSION}_amd64.deb`;
export const LINUX_DEB_URL = `${DOWNLOAD_BASE_URL}/${LINUX_DEB_FILENAME}`;

