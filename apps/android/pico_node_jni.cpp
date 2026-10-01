// ADR 0131 A1. The whole JNI surface an embedded Node needs: argv in, exit
// code out, stdout and stderr redirected to a file the host can read with
// run-as. Everything else is Node's own.
//
// The symbol name carries the Java package, because that is how JNI finds a
// native method. On 2026-09-27 NodeRuntime moved from com.pico.a1probe to the
// app's own package and this name stayed behind, so every service of the app
// died on its first Node start with UnsatisfiedLinkError - found on 2026-10-01
// on an A34, the first time the app ran on a phone. `manifest:check` now holds
// each native method against a symbol here.
#include <jni.h>
#include <stdio.h>
#include <vector>
#include <string>
#include "node.h"

extern "C" JNIEXPORT jint JNICALL
Java_io_github_riederch_pico_NodeRuntime_startNode(
    JNIEnv* env, jclass, jobjectArray jargv, jstring joutPath) {
  const char* outPath = env->GetStringUTFChars(joutPath, nullptr);
  freopen(outPath, "a", stdout);
  freopen(outPath, "a", stderr);
  setvbuf(stdout, nullptr, _IONBF, 0);
  setvbuf(stderr, nullptr, _IONBF, 0);
  env->ReleaseStringUTFChars(joutPath, outPath);

  int argc = env->GetArrayLength(jargv);
  std::vector<std::string> store;
  store.reserve(argc);
  for (int i = 0; i < argc; i++) {
    jstring s = (jstring)env->GetObjectArrayElement(jargv, i);
    const char* c = env->GetStringUTFChars(s, nullptr);
    store.emplace_back(c);
    env->ReleaseStringUTFChars(s, c);
  }
  std::vector<char*> argv;
  argv.reserve(argc);
  for (auto& s : store) argv.push_back(s.data());
  return node::Start(argc, argv.data());
}
