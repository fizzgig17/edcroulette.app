Pod::Spec.new do |s|
  s.name           = 'EdcSubjectMask'
  s.version        = '1.0.0'
  s.summary        = 'Finds the separate objects in a photo with Apple Vision'
  s.description    = 'Returns a label for every pixel saying which object it belongs to (0 is background).'
  s.author         = 'EDC Roulette'
  s.homepage       = 'https://edcroulette.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
