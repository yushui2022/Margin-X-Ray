import Foundation
import ImageIO
import Vision

// Read from stdin. Thumbnail generation applies EXIF rotation before OCR.
let data = FileHandle.standardInput.readDataToEndOfFile()
guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 3600
      ] as CFDictionary) else { exit(2) }

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
if #available(macOS 13.0, *) { request.automaticallyDetectsLanguage = true }
do {
    try VNImageRequestHandler(cgImage: image).perform([request])
    for line in request.results ?? [] {
        if let candidate = line.topCandidates(1).first { print(candidate.string) }
    }
} catch { exit(3) }
