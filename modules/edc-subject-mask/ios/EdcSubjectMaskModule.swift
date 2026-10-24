import ExpoModulesCore
import Vision
import UIKit

/// Finds the separate objects in a photo (iPhone only, iOS 17 and later) so the app can
/// outline each one exactly. Everything stays on the phone.
public class EdcSubjectMaskModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EdcSubjectMask")

    // One byte per pixel: 0 is background, 1, 2, 3... are the objects. Returned as base64.
    AsyncFunction("instanceMask") { (uri: String, maxEdge: Int) -> [String: Any]? in
      guard #available(iOS 17.0, *) else { return nil }
      guard let url = URL(string: uri),
            let data = try? Data(contentsOf: url),
            let source = UIImage(data: data) else { return nil }

      // Draw the photo upright and at a modest size (fast, and no rotation surprises).
      let longest = max(source.size.width, source.size.height)
      let scale = min(1, CGFloat(maxEdge) / longest)
      let size = CGSize(width: source.size.width * scale, height: source.size.height * scale)
      let format = UIGraphicsImageRendererFormat.default()
      format.scale = 1
      let drawn = UIGraphicsImageRenderer(size: size, format: format).image { _ in
        source.draw(in: CGRect(origin: .zero, size: size))
      }
      guard let cgImage = drawn.cgImage else { return nil }

      let request = VNGenerateForegroundInstanceMaskRequest()
      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      try handler.perform([request])
      guard let observation = request.results?.first else { return nil }

      let buffer = observation.instanceMask
      CVPixelBufferLockBaseAddress(buffer, .readOnly)
      defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
      let width = CVPixelBufferGetWidth(buffer)
      let height = CVPixelBufferGetHeight(buffer)
      let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
      guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
      let rows = base.assumingMemoryBound(to: UInt8.self)

      var packed = Data(count: width * height)
      packed.withUnsafeMutableBytes { raw in
        guard let out = raw.bindMemory(to: UInt8.self).baseAddress else { return }
        for y in 0..<height {
          memcpy(out + y * width, rows + y * bytesPerRow, width)
        }
      }
      return ["width": width, "height": height, "data": packed.base64EncodedString()]
    }
  }
}
