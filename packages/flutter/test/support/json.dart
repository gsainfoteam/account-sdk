import 'dart:convert';

/// [source] 를 JSON 객체로 읽는다. 객체가 아니면 [FormatException] 을 던진다.
Map<String, Object?> jsonObject(String source) => switch (jsonDecode(source)) {
  final Map<String, Object?> object => object,
  _ => throw const FormatException('JSON 객체가 아니다'),
};
