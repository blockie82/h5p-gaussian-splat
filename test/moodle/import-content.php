<?php
// Imports a .h5p into a course content bank, like the content bank "Upload" button.
// Usage: php import-content.php <moodle-dir> <file.h5p> <course context id>
define('CLI_SCRIPT', true);
[$_, $moodle, $package, $contextid] = $argv;
require($moodle . '/config.php');
\core\session\manager::set_user(get_admin());
$fs = get_file_storage();
$usercontext = context_user::instance($USER->id);
$file = $fs->create_file_from_pathname(['contextid' => $usercontext->id, 'component' => 'user', 'filearea' => 'draft',
    'itemid' => file_get_unused_draft_itemid(), 'filepath' => '/', 'filename' => basename($package)], $package);
$cb = new \core_contentbank\contentbank();
$content = $cb->create_content_from_file(context::instance_by_id($contextid), $USER->id, $file);
echo "content id: ", $content->get_id(), "\n";
