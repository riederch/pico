// ADR 0131 A1. The whole JNI surface an embedded Node needs: argv in, exit
// code out, stdout and stderr redirected to a file the host can read with
// run-as. Everything else is Node's own.
#include <jni.h>
#include <stdio.h>
#include <vector>
#include <string>
#include "node.h"

extern "C" JNIEXPORT jint JNICALL
Java_com_pico_a1probe_NodeRuntime_startNode(
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
