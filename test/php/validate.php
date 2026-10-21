<?php
// Validates a .h5p package with the official H5P PHP library (H5PValidator).
// Usage: php validate.php <path-to-h5p-php-library> <file.h5p> [extra whitelist extensions]
[$_, $lib, $package] = $argv;
$extra = $argv[3] ?? '';
require_once "$lib/h5p.classes.php";
require_once "$lib/h5p-development.class.php";
require_once "$lib/h5p-file-storage.interface.php";
require_once "$lib/h5p-default-storage.class.php";

$work = sys_get_temp_dir() . '/h5pval-' . getmypid();
@mkdir($work, 0777, true);
copy($package, "$work/upload.h5p");

// Build a stub implementation of H5PFrameworkInterface
$methods = [];
foreach ((new ReflectionClass('H5PFrameworkInterface'))->getMethods() as $m) {
  $params = [];
  foreach ($m->getParameters() as $p) {
    $s = ($p->isPassedByReference() ? '&' : '') . '$' . $p->getName();
    if ($p->isOptional()) $s .= ' = NULL';
    $params[] = $s;
  }
  $methods[$m->getName()] = 'public function ' . $m->getName() . '(' . implode(', ', $params) . ') { return $this->call("' . $m->getName() . '", func_get_args()); }';
}
eval('class StubFramework implements H5PFrameworkInterface { public $impl; ' . implode("\n", $methods) . ' public function call($n, $a) { return isset($this->impl[$n]) ? call_user_func_array($this->impl[$n], $a) : NULL; } }');

$errors = [];
$f = new StubFramework();
$f->impl = [
  'getPlatformInfo' => fn() => ['name' => 'validator', 'version' => '1', 'h5pVersion' => '1.27'],
  't' => fn($m, $r = []) => strtr($m, $r ?? []),
  'setErrorMessage' => function ($m) use (&$errors) { $errors[] = $m; },
  'setInfoMessage' => function ($m) { echo "info: $m\n"; },
  'getMessages' => fn() => [],
  'getUploadedH5pFolderPath' => fn() => "$work/extracted",
  'getUploadedH5pPath' => fn() => "$work/upload.h5p",
  'getWhitelist' => fn($isLib, $content, $libExtra) => trim($content . ' ' . $extra . ($isLib ? ' ' . $libExtra : '')),
  'getLibraryId' => fn() => FALSE,
  'loadLibraries' => fn() => [],
  'mayUpdateLibraries' => fn() => TRUE,
  'getOption' => fn($n, $d = NULL) => $d,
  'hasPermission' => fn() => TRUE,
  'isPatchedLibrary' => fn() => FALSE,
  'isInDevMode' => fn() => FALSE,
  'getLibraryConfig' => fn() => NULL,
  'libraryHasUpgrade' => fn() => FALSE,
];
$core = new H5PCore($f, $work, '/h5p', 'en', FALSE);
$validator = new H5PValidator($f, $core);
$ok = $validator->isValidPackage();
echo $ok ? "VALID\n" : "INVALID\n";
foreach ($errors as $e) echo " - $e\n";
if ($ok) {
  foreach ($core->librariesJsonData as $name => $lib) {
    echo "library: $name {$lib['majorVersion']}.{$lib['minorVersion']}.{$lib['patchVersion']}\n";
  }
}
exec('rm -rf ' . escapeshellarg($work));
