<?php
// Runs a cameraView value through H5P's real save-time text sanitising.
// Usage: php save-roundtrip.php <path-to-h5p-php-library> <value>
[$_, $lib, $value] = $argv;
require_once "$lib/h5p.classes.php";
require_once "$lib/h5p-file-storage.interface.php";
require_once "$lib/h5p-default-storage.class.php";
$validator = (new ReflectionClass('H5PContentValidator'))->newInstanceWithoutConstructor();
$semantics = (object) ['name' => 'cameraView', 'type' => 'text', 'widget' => 'none', 'optional' => TRUE];
$validator->validateText($value, $semantics);
echo $value, "\n";
