<?php
// Installs H5P libraries from a .h5p file into a Moodle site, exactly as
// Site administration > H5P > Manage H5P content types does.
// Usage: php install-libs.php <moodle-dir> <file.h5p>
define('CLI_SCRIPT', true);
[$_, $moodle, $package] = $argv;
require($moodle . '/config.php');
\core\session\manager::set_user(get_admin());
$fs = get_file_storage();
$usercontext = context_user::instance($USER->id);
$draftid = file_get_unused_draft_itemid();
$file = $fs->create_file_from_pathname([
    'contextid' => $usercontext->id, 'component' => 'user', 'filearea' => 'draft',
    'itemid' => $draftid, 'filepath' => '/', 'filename' => basename($package),
], $package);
$factory = new \core_h5p\factory();
$result = \core_h5p\helper::save_h5p($factory, $file, new stdClass(), false, true);
echo $result === false ? "FAILED\n" : "OK\n";
foreach ($factory->get_framework()->getMessages('error') ?: [] as $m) { echo " error: ", is_object($m) ? $m->message : $m, "\n"; }
foreach ($DB->get_records_select('h5p_libraries', "machinename LIKE '%Splat%' OR machinename LIKE '%ColorSelector%'") as $l) {
    echo " installed: {$l->machinename} {$l->majorversion}.{$l->minorversion}.{$l->patchversion} (id {$l->id})\n";
}
