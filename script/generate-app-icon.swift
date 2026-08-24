#!/usr/bin/env swift

import AppKit
import Foundation

// AYA-Plus keeps the original artwork and adds one deterministic vector badge.
// The generated files are committed so Linux and Windows builds do not need Swift.

private struct BadgeLayout {
    let centerX: CGFloat
    let centerY: CGFloat
    let radius: CGFloat
}

private enum IconGenerationError: Error, CustomStringConvertible {
    case imageNotFound(URL)
    case imageEncodingFailed(URL)

    var description: String {
        switch self {
        case .imageNotFound(let url):
            return "无法读取图标源文件：\(url.path)"
        case .imageEncodingFailed(let url):
            return "无法生成 PNG：\(url.path)"
        }
    }
}

private let repositoryRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
private let buildDirectory = repositoryRoot.appendingPathComponent("build")
private let appxDirectory = buildDirectory.appendingPathComponent("appx")
private let sourceDirectory = repositoryRoot.appendingPathComponent("script/assets/app-icon")
private let squareSource = sourceDirectory.appendingPathComponent("icon.png")
private let storeSource = sourceDirectory.appendingPathComponent("StoreLogo.png")
private let wideSource = sourceDirectory.appendingPathComponent("Wide310x150Logo.png")

private func squareBadgeLayout(width: Int, height: Int) -> BadgeLayout {
    let side = CGFloat(min(width, height))
    let radiusScale: CGFloat

    // Enlarge the badge slightly at taskbar sizes so the plus remains legible.
    if side <= 44 {
        radiusScale = 0.17
    } else if side <= 128 {
        radiusScale = 0.155
    } else {
        radiusScale = 0.14
    }

    return BadgeLayout(
        centerX: CGFloat(width) * 0.80,
        centerY: CGFloat(height) * 0.20,
        radius: side * radiusScale
    )
}

private func drawBadge(_ layout: BadgeLayout) {
    let outerCircle = NSBezierPath(
        ovalIn: NSRect(
            x: layout.centerX - layout.radius,
            y: layout.centerY - layout.radius,
            width: layout.radius * 2,
            height: layout.radius * 2
        )
    )
    NSColor(calibratedRed: 0.12, green: 0.15, blue: 0.19, alpha: 1).setFill()
    outerCircle.fill()

    let outline = max(1, layout.radius * 0.095)
    let innerRadius = layout.radius - outline
    let innerCircle = NSBezierPath(
        ovalIn: NSRect(
            x: layout.centerX - innerRadius,
            y: layout.centerY - innerRadius,
            width: innerRadius * 2,
            height: innerRadius * 2
        )
    )
    NSColor(calibratedRed: 0.24, green: 0.86, blue: 0.52, alpha: 1).setFill()
    innerCircle.fill()

    let plusLength = innerRadius * 1.10
    let plusThickness = max(1.2, innerRadius * 0.32)
    let horizontal = NSBezierPath(
        roundedRect: NSRect(
            x: layout.centerX - plusLength / 2,
            y: layout.centerY - plusThickness / 2,
            width: plusLength,
            height: plusThickness
        ),
        xRadius: plusThickness / 2,
        yRadius: plusThickness / 2
    )
    let vertical = NSBezierPath(
        roundedRect: NSRect(
            x: layout.centerX - plusThickness / 2,
            y: layout.centerY - plusLength / 2,
            width: plusThickness,
            height: plusLength
        ),
        xRadius: plusThickness / 2,
        yRadius: plusThickness / 2
    )
    NSColor.white.setFill()
    horizontal.fill()
    vertical.fill()
}

private func renderPNG(
    source: URL,
    width: Int,
    height: Int,
    badgeLayout: BadgeLayout,
    output: URL? = nil
) throws -> Data {
    guard let sourceImage = NSImage(contentsOf: source) else {
        throw IconGenerationError.imageNotFound(source)
    }
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        throw IconGenerationError.imageEncodingFailed(output ?? source)
    }

    bitmap.size = NSSize(width: width, height: height)
    guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw IconGenerationError.imageEncodingFailed(output ?? source)
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    NSColor.clear.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    sourceImage.draw(
        in: NSRect(x: 0, y: 0, width: width, height: height),
        from: .zero,
        operation: .sourceOver,
        fraction: 1
    )
    drawBadge(badgeLayout)
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()

    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        throw IconGenerationError.imageEncodingFailed(output ?? source)
    }
    if let output {
        try data.write(to: output, options: .atomic)
    }
    return data
}

private func appendUInt16LE(_ value: UInt16, to data: inout Data) {
    data.append(UInt8(value & 0xff))
    data.append(UInt8((value >> 8) & 0xff))
}

private func appendUInt32LE(_ value: UInt32, to data: inout Data) {
    data.append(UInt8(value & 0xff))
    data.append(UInt8((value >> 8) & 0xff))
    data.append(UInt8((value >> 16) & 0xff))
    data.append(UInt8((value >> 24) & 0xff))
}

private func appendUInt32BE(_ value: UInt32, to data: inout Data) {
    data.append(UInt8((value >> 24) & 0xff))
    data.append(UInt8((value >> 16) & 0xff))
    data.append(UInt8((value >> 8) & 0xff))
    data.append(UInt8(value & 0xff))
}

private func writeICO(images: [(size: Int, data: Data)], output: URL) throws {
    var icon = Data()
    appendUInt16LE(0, to: &icon)
    appendUInt16LE(1, to: &icon)
    appendUInt16LE(UInt16(images.count), to: &icon)

    var offset = UInt32(6 + images.count * 16)
    for image in images {
        icon.append(image.size == 256 ? 0 : UInt8(image.size))
        icon.append(image.size == 256 ? 0 : UInt8(image.size))
        icon.append(0)
        icon.append(0)
        appendUInt16LE(1, to: &icon)
        appendUInt16LE(32, to: &icon)
        appendUInt32LE(UInt32(image.data.count), to: &icon)
        appendUInt32LE(offset, to: &icon)
        offset += UInt32(image.data.count)
    }
    for image in images {
        icon.append(image.data)
    }

    try icon.write(to: output, options: .atomic)
}

private func writeICNS(images: [(type: String, data: Data)], output: URL) throws {
    var body = Data()
    for image in images {
        body.append(contentsOf: image.type.utf8)
        appendUInt32BE(UInt32(image.data.count + 8), to: &body)
        body.append(image.data)
    }

    var icon = Data("icns".utf8)
    appendUInt32BE(UInt32(body.count + 8), to: &icon)
    icon.append(body)
    try icon.write(to: output, options: .atomic)
}

private func generate() throws {
    _ = try renderPNG(
        source: squareSource,
        width: 512,
        height: 512,
        badgeLayout: squareBadgeLayout(width: 512, height: 512),
        output: buildDirectory.appendingPathComponent("icon.png")
    )
    _ = try renderPNG(
        source: squareSource,
        width: 128,
        height: 128,
        badgeLayout: squareBadgeLayout(width: 128, height: 128),
        output: repositoryRoot.appendingPathComponent("src/renderer/assets/icon.png")
    )
    for size in [44, 150] {
        _ = try renderPNG(
            source: squareSource,
            width: size,
            height: size,
            badgeLayout: squareBadgeLayout(width: size, height: size),
            output: appxDirectory.appendingPathComponent("Square\(size)x\(size)Logo.png")
        )
    }
    _ = try renderPNG(
        source: storeSource,
        width: 200,
        height: 200,
        badgeLayout: squareBadgeLayout(width: 200, height: 200),
        output: appxDirectory.appendingPathComponent("StoreLogo.png")
    )
    _ = try renderPNG(
        source: wideSource,
        width: 310,
        height: 150,
        badgeLayout: BadgeLayout(centerX: 257, centerY: 30, radius: 21),
        output: appxDirectory.appendingPathComponent("Wide310x150Logo.png")
    )

    let icnsSlots = [
        ("ic11", 32),
        ("ic12", 64),
        ("ic07", 128),
        ("ic13", 256),
        ("ic08", 256),
        ("ic14", 512),
        ("ic09", 512),
        ("ic10", 1024),
    ]
    let icnsImages = try icnsSlots.map { type, size in
        (
            type,
            try renderPNG(
                source: squareSource,
                width: size,
                height: size,
                badgeLayout: squareBadgeLayout(width: size, height: size)
            )
        )
    }
    try writeICNS(
        images: icnsImages,
        output: buildDirectory.appendingPathComponent("icon.icns")
    )

    let icoImages = try [16, 24, 32, 48, 64, 128, 256].map { size in
        (
            size,
            try renderPNG(
                source: squareSource,
                width: size,
                height: size,
                badgeLayout: squareBadgeLayout(width: size, height: size)
            )
        )
    }
    try writeICO(images: icoImages, output: buildDirectory.appendingPathComponent("icon.ico"))

    print("AYA-Plus 应用图标已生成。")
}

do {
    try generate()
} catch {
    fputs("\(error)\n", stderr)
    exit(1)
}
