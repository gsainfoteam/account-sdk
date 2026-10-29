import 'dart:convert';

Map<String, Object?> jsonObject(String source) => switch (jsonDecode(source)) {
  final Map<String, Object?> object => object,
  _ => throw const FormatException('JSON 객체가 아니다'),
};
